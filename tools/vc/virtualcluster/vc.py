#!/usr/bin/env python
"""
Virtual Cluster

Usage:
    vc new <network> <host/count>...
    vc prepare [-ksvd -i <file>] [--] <binary_path>
    vc run [-svd -i <file>] [--] <cmd>...
    vc apply [-svd -i <file>] [-- <extra_args>...]
    vc reset [-svd -i <file>]
    vc -h | --help

Options:
    -i <file>, --inventory <file>  Path to the inventory file
    -s, --sudo                     Prepend sudo to all commands
    -v, --verbose                  Print SSH commands and output
    -d, --dry-run                  Don't run any SSH commands
    -k, --skip-install             Skip installing dependencies
"""
from __future__ import print_function

import ipaddress
import hashlib
import jinja2
import json
import yaml
import socket
import sys

import virtualcluster.cmd


VC_BINARY = '/tmp/vc_binary'
RINGPOP_HOSTS = '/tmp/hosts.json'


def new(hostcounts, network):
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
                'iface': '%s/%s' % (str(next(network_iter)), pref),
                'running': True,
            })
        hostsession['bridge'] = {
            'device': 'vc_br0',
            'iface': '%s/%s' % (str(network.broadcast_address - hostindex), pref),
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


def read_session(inv_file):
    try:
        session = yaml.load(inv_file.read())
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
def prepare(session, binary_path, skipinstall=False, verbose=False, dryrun=False, sudo=False):
    t = jinja2.Template(prepare_template)
    for host, host_config in sorted(session.items()):
        script = t.render(
            vhosts=host_config['vhosts'],
            bridge=host_config['bridge'],
            net_interface='eth0'
        )
        if not skipinstall:
            script = install_template + script
        client = virtualcluster.cmd.Client(host, verbose=verbose, dryrun=dryrun, sudo=sudo)
        client.run_script(script)
        client.copy(binary_path, VC_BINARY)
        client.run('chmod +x %s' % VC_BINARY)


reset_template = """
ovs-vsctl del-br {{bridge.device}}
{% for host in vhosts %}
ip netns delete {{host.namespace}}
{% endfor %}
"""
def reset(session, verbose=False, dryrun=False, sudo=False):
    for host, host_config in sorted(session.items()):
        for vhost in host_config['vhosts']:
            vhost['running'] = False
    # kill all running processes
    apply_(session, verbose, dryrun, sudo, [], update_hosts=False)
    t = jinja2.Template(reset_template)
    for host, host_config in sorted(session.items()):
        script = t.render(
            vhosts=host_config['vhosts'],
            bridge=host_config['bridge'],
        )
        client = virtualcluster.cmd.Client(host, verbose=verbose, dryrun=dryrun, sudo=sudo)
        client.run_script(script)
        client.run('rm -f %s' % VC_BINARY)
        client.run('rm -f %s' % RINGPOP_HOSTS)


def apply_(session, verbose=False, dryrun=False, sudo=False, extra_args=[], update_hosts=True):
    if update_hosts:
        hosts_file = []
        for _, host_config in sorted(session.items()):
            for vhost in host_config['vhosts']:
                if not vhost['running']:
                    continue
                iface = ipaddress.IPv4Interface(vhost['iface'])
                hosts_file.append('%s:3000' % iface.ip)
        hosts_file = json.dumps(hosts_file)
    for host, host_config in sorted(session.items()):
        client = virtualcluster.cmd.Client(host, verbose=verbose, dryrun=dryrun, sudo=sudo)
        if update_hosts:
            client.run("echo '%s' > /tmp/hosts.json" % hosts_file)
        for vhost in host_config['vhosts']:
            # running_pid = client.run('ip netns pids %s' % vhost['namespace'])
            running_pid = client.run('find -L /proc/[1-9]*/ns/net -samefile /run/netns/%s 2>/dev/null | cut -d/ -f3' % vhost['namespace'])
            if running_pid and not vhost['running']:
                client.run('kill %s' % running_pid)
            elif not running_pid and vhost['running']:
                ip = ipaddress.IPv4Interface(vhost['iface'])
                ipport = '%s:3000' % ip.ip
                cmd = virtualcluster.cmd.spawn_cmd(
                    '%s -hosts /tmp/hosts.json --listen %s:3000 %s' %
                    (VC_BINARY, ip.ip, ' '.join(extra_args)),
                    '/tmp/%s.out' % ip.ip,
                    '/tmp/%s.err' % ip.ip,
                )
                pid = client.run('ip netns exec %s %s' % (vhost['namespace'], cmd))


def run(session, cmd, verbose=False, dryrun=False, sudo=False):
    cmd = ' '.join(cmd)
    for host, host_config in sorted(session.items()):
        client = virtualcluster.cmd.Client(host, verbose=verbose, dryrun=dryrun, sudo=sudo)
        for vhost in host_config['vhosts']:
            client.run('ip netns exec %s %s' % (vhost['namespace'], cmd))


def run_main():
    import docopt
    args = docopt.docopt(__doc__, version='0.1')

    if args['new']:
        new(args['<host/count>'], args['<network>'])
    else:
        inv_path = args.get('--inventory')
        inv_file = sys.stdin
        if inv_path:
            inv_file = open(inv_path)
        session = read_session(inv_file)
        if args['prepare']:
            prepare(session, args['<binary_path>'], args['--skip-install'], args['--verbose'], args['--dry-run'], args['--sudo'])
        if args['reset']:
            reset(session, args['--verbose'], args['--dry-run'], args['--sudo'])
        if args['apply']:
            apply_(session, args['--verbose'], args['--dry-run'], args['--sudo'], args['<extra_args>'])
        if args['run']:
            run(session, args['<cmd>'], args['--verbose'], args['--dry-run'], args['--sudo'])


def main():
    try:
        run_main()
    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)


main = run_main


if __name__ == '__main__':
    main()
