#!/usr/bin/env python
"""
Virtual Cluster

Usage:
    vc new <network> <host/count>...
    vc prepare [--skip-install] [--verbose] [--dry-run] <inventory_file>
    vc reset [--verbose] [--dry-run] <inventory_file>
    vc runtestpop [--verbose] [--dry-run] <inventory_file> <binary_path>
    vc run [--verbose] [--dry-run] <inventory_file> <cmd>
    vc killservers [--verbose] [--dry-run] <inventory_file>
    vc -h | --help


Options:
    --verbose           Print SSH commands and output
    --dry-run           Don't run any SSH commands
"""
from __future__ import print_function

import ipaddress
import hashlib
import jinja2
import json
import yaml
import socket
import sys

import clustershaper.cmd


verbose, dryrun = False, False


def session_new(hostcounts, network):
    hosts = {}
    for hc in hostcounts:
        if '/' not in hc:
            raise ValueError('Invalid <host/count> %r' % hc)
        host, count = hc.split('/', 1)
        if not count.isdigit():
            raise ValueError('Invalid count %r' % hc)
        count = int(count)
        hosts[host] = hosts.get(host, 0) + count
    network = ipaddress.ip_network(network, strict=True)
    # 1 ip for each hc and len(hosts) ips for bridges
    if network.num_addresses < len(hosts) + sum(hosts.values()):
        raise ValueError('Network size is too small')
    session = {}
    network_iter = iter(network.hosts())
    pref = network.prefixlen
    for hostindex, (host, count) in enumerate(sorted(hosts.items()), 1):
        if not count > 0:
            continue
        hostsession = session.setdefault(host, {'vhosts': []})
        vhosts = hostsession['vhosts']
        for i in range(count):
            vhosts.append({
                'namespace': 'ns%s' % i,
                'device': 'vc_tap%s' % i,
                'iface': '%s/%s' % (next(network_iter), pref),
            })
        hostsession['bridge'] = {
            'device': 'vc_br0',
            'iface': '%s/%s' % (network.broadcast_address - hostindex, pref),
        }
    hosts = sorted(session)
    if len(hosts)> 1:
        for host_i in range(len(hosts)):
            bridge = session[hosts[host_i]]['bridge']
            if host_i == len(hosts) - 1:
                peers = [hosts[host_i - 1]]
            elif host_i == 0:
                peers = [hosts[1]]
            else:
                peers = [hosts[host_i - 1], hosts[host_i + 1]]
            bridge['peers'] = []
            for i, peer in enumerate(peers):
                bridge['peers'].append({
                    'device': 'cv_vxlan%i' % i,
                    'host': peer,
                })
    print(yaml.dump(session))


def read_session(inventory_file):
    try:
        with open(inventory_file) as f:
            session = yaml.load(f.read())
            for host in session.values():
                for peer in host['bridge'].get('peers', []):
                    peer['ip'] = socket.gethostbyname(peer['host'])
                    if ipaddress.IPv4Address(peer['ip']).is_loopback:
                        peer['ip'] = get_ip_address()
            return session
    except Exception as e:
        raise ValueError(str(e))


def get_ip_address():
    # Cool hack to see what IP would route to 8.8.8.8 without opening an
    # actual connection
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    return s.getsockname()[0]


# ovs-vsctl set bridge cs_ovsbr0 stp_enable=true
prepare_template = """
ovs-vsctl add-br {{bridge.device}}
ip link set dev {{bridge.device}} mtu 1446
{% for host in vhosts %}
ip netns add {{host.namespace}}
ip netns exec {{host.namespace}} ip link set dev lo up
ovs-vsctl add-port {{bridge.device}} {{host.device}} -- set Interface {{host.device}} type=internal
ip link set {{host.device}} netns {{host.namespace}}
ip netns exec {{host.namespace}} ip link set dev {{host.device}} up
ip netns exec {{host.namespace}} ip addr add {{host.iface}} dev {{host.device}}
ip netns exec {{host.namespace}} ip link set dev {{host.device}} mtu 1446
{% endfor %}
{% for peer in bridge.peers %}
ovs-vsctl add-port {{bridge.device}} {{peer.device}} -- set interface {{peer.device}} type=vxlan options:remote_ip={{peer.ip}}
{% endfor %}
ip addr add {{bridge.iface}} dev {{bridge.device}}
ip link set {{bridge.device}} up
"""
install_template = """
apt-get update
apt-get -y install openvswitch-switch
"""
def prepare(inventory_file, skipinstall=False, verbose=False, dryrun=False):
    session = read_session(inventory_file)
    t = jinja2.Template(prepare_template)
    for host, host_config in sorted(session.items()):
        script = t.render(
            vhosts=host_config['vhosts'],
            bridge=host_config['bridge'],
            net_interface='eth0'
        )
        if not skipinstall:
            script = install_template + script
        client = clustershaper.cmd.Client(host, verbose=verbose, dryrun=dryrun)
        client.run_script(script)


reset_template = """
ovs-vsctl del-br {{bridge.device}}
{% for host in vhosts %}
ip netns delete {{host.namespace}}
{% endfor %}
"""
def network_reset(inventory_file, verbose=False, dryrun=False):
    session = read_session(inventory_file)
    t = jinja2.Template(reset_template)
    for host, host_config in sorted(session.items()):
        script = t.render(
            vhosts=host_config['vhosts'],
            bridge=host_config['bridge'],
        )
        client = clustershaper.cmd.Client(host, verbose=verbose, dryrun=dryrun)
        client.run_script(script)


run_template = """
echo '{{json_hosts}}' > {{remote_path}}_hosts.json
{% for hi in hostindexes %}
(ip netns exec cs_{{hi.index}} {{remote_path}} -hosts {{remote_path}}_hosts.json --listen {{hi.host}}:3000 > out{{hi.index}}.log 2> err{{hi.index}}.log < /dev/null &)
{% endfor %}
"""
def runtestpop(inventory_file, binary_path, verbose, dryrun):
    binary_md5 = hashlib.md5(open(binary_path,'rb').read()).hexdigest()
    remote_path = '/tmp/%s' % binary_md5
    session = read_session(inventory_file)
    ips = []
    for _, host_config in sorted(session.items()):
        for vhost in host_config['vhosts']:
            iface = ipaddress.IPv4Interface(vhost['iface'])
            ips.append('%s:3000' % iface.ip)
    json_ips = json.dumps(ips)
    for host, host_config in sorted(session.items()):
        client = clustershaper.cmd.Client(host, verbose=verbose, dryrun=dryrun)
        client.run("echo '%s' > /tmp/hosts.json" % json_ips)
        client.copy(binary_path, remote_path)
        client.run('chmod +x %s' % remote_path)
        for vhost in host_config['vhosts']:
            ip = ipaddress.IPv4Interface(vhost['iface'])
            ipport = '%s:3000' % ip.ip
            cmd = clustershaper.cmd.spawn_cmd(
                '%s -hosts /tmp/hosts.json --listen %s:3000' %
                (remote_path, ip.ip),
                '/tmp/%s.out' % ip.ip,
                '/tmp/%s.err' % ip.ip,
            )
            pid = client.run('ip netns exec %s %s' % (vhost['namespace'], cmd))


def run(inventory_file, cmd, verbose=verbose, dryrun=dryrun):
    session = read_session(inventory_file)
    for host, host_config in sorted(session.items()):
        client = clustershaper.cmd.Client(host, verbose=verbose, dryrun=dryrun)
        for vhost in host_config['vhosts']:
            client.run('ip netns exec %s %s' % (vhost['namespace'], cmd))


def killservers(inventory_file, verbose=verbose, dryrun=dryrun):
    session = read_session(inventory_file)
    for host, host_config in sorted(session.items()):
        client = clustershaper.cmd.Client(host, verbose=verbose, dryrun=dryrun)
        for vhost in host_config['vhosts']:
            cmd = 'kill `ip netns exec %s lsof -Pni | grep LISTEN | cut -f2 -d\ `' % vhost['namespace']
            client.run(cmd)


def run_main():
    import docopt
    args = docopt.docopt(__doc__, version='0.1')

    if args['new']:
        session_new(args['<host/count>'], args['<network>'])
    if args['prepare']:
        prepare(args['<inventory_file>'], args['--skip-install'], args['--verbose'], args['--dry-run'])
    if args['reset']:
        network_reset(args['<inventory_file>'], args['--verbose'], args['--dry-run'])
    if args['runtestpop']:
        runtestpop(args['<inventory_file>'], args['<binary_path>'], args['--verbose'], args['--dry-run'])
    if args['run']:
        run(args['<inventory_file>'], args['<cmd>'], args['--verbose'], args['--dry-run'])
    if args['killservers']:
        killservers(args['<inventory_file>'], args['--verbose'], args['--dry-run'])


def main():
    try:
        run_main()
    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
