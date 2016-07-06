#!/usr/bin/env python
"""
Virtual Cluster

Usage:
    vc --help
    vc --version
    vc prep    [-vdk -i IPS -n NETWORK] [[-H HOST]...|-h HOSTSFILE|-]
    vc reset   [-vd] [[-H HOST]...|-h HOSTSFILE|-]
    vc runns   [-vd] [[-H HOST]...|-h HOSTSFILE|-|-g HOSTGROUP] [--] CMD...
    vc exe     [-vd] [[-H HOST]...|-h HOSTSFILE|-] [-g HOSTGROUP] [--] PATH [ARG]...
    vc shape   [-vd] (-g HOSTGROP) (-g HOSTGROUP)... [--] [CONDITION]...
    vc unshape [-vd] [[-H HOST]...|-h HOSTSFILE|-|-g HOSTGROUP]

Options:
    -                                    Read HOSTSFILE from stdin
    -n NETWORK, --network NETWORK        Virtual network [default: 10.10.0.0/16]
    -h HOSTSFILE, --hostsfile HOSTSFILE  Path to a file containing all hosts in the virtual cluster
    -H HOST, --host HOST                 A host part of the virtual cluster
    -g HOSTGROUP, --group HOSTGROUP      A list of host ranges
    -i IPS, --ips IPS                    The number of IPs to reserve per host [default: 50]
    -v, --verbose                        Print SSH commands and output
    -d, --dry-run                        Do not run commands with side effects
    -k, --skip-install                   Skip installing dependencies
    --version                            Show version number
    --help                               Halp!
"""
from __future__ import print_function

import functools
import ipaddress
import hashlib
import jinja2
import json
import re
import socket
import sys
import yaml

import virtualcluster.cmd


def read_groups_or_hosts_as_groups(args):
    groups = read_groups(args)
    if groups:
        groups = groups[0]
    else:
        groups = merge_groups([parse_hostgroup(h) for h in read_hosts(args)])
    return groups

def read_hosts(args):
    hosts = args.get('--host')
    if hosts:
        return hosts
    hosts_file = args.get('--hostsfile')
    if hosts_file:
        return list(filter(None, (h.strip() for h in open(hosts_file))))
    read_from_stdin = args.get('-')
    if read_from_stdin:
        return list(filter(None, (h.strip() for h in sys.stdin)))
    return ['localhost']

def read_groups(args):
    groups = args.get('--group', '')
    return [
        merge_groups([parse_hostgroup(g) for g in group.split(',')])
        for group in groups
    ]

def merge_groups(groups):
    g = {}
    for host, start, stop in groups:
        for i in range(start, stop):
            g.setdefault(host, set()).add(i)
    return dict((k, sorted(v)) for k, v in g.items())

hostgroup_re = re.compile('^(?P<host>[^\[]+)(?P<slice>\[(?P<start>\d*)(?P<end>:(?P<stop>\d*))?\])?$')
def parse_hostgroup(hostgroup):
    match = hostgroup_re.match(hostgroup)
    err = ValueError('Invalid hostgroup: %s' % hostgroup)
    if not match:
        raise err
    host = match.group('host')
    if not match.group('slice'):
        start, stop = 0, 250
    else:
        start = match.group('start') and int(match.group('start')) or 0
        stop = match.group('stop') and int(match.group('stop')) or 250
        if not match.group('end'):
            stop = start + 1
    if stop < start:
        raise err
    return host, start, stop

def hosts_to_ips(hosts):
    ips = set([get_net_ip(h) for h in hosts])
    if len(ips) != len(hosts):
        raise ValueError('Some hosts resolve to the same IP')
    return ips

def get_net_ip(host):
    ip = socket.gethostbyname(host)
    if ipaddress.IPv4Address(ip).is_loopback:
        # Cool hack to see what IP would route to 8.8.8.8 without opening an
        # actual connection
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    return ip


def hash_file(f, blocksize=65536):
    hasher = hashlib.sha256()
    block_size = 2**16
    buf = f.read(block_size)
    while len(buf) > 0:
        hasher.update(buf)
        buf = f.read(block_size)
    return hasher.hexdigest()


def indexes_as_list(indexes):
    i = ','.join(map(str, (index + 1 for index in indexes)))
    if len(indexes) > 1:
        i = '{%s}' % i
    return i


prep_template = """
sudo -n -- ovs-vsctl add-br vc_bridge
sudo -n -- ip link set dev vc_bridge mtu 1446
for I in `seq 1 {{ips_per_host}}`; do
    sudo -n -- ip netns add vc_ns$I
    sudo -n -- ip netns exec vc_ns$I ip link set dev lo up
    sudo -n -- ovs-vsctl add-port vc_bridge vc_port$I -- set Interface vc_port$I type=internal
    sudo -n -- ip link set vc_port$I netns vc_ns$I
    sudo -n -- ip netns exec vc_ns$I ip link set dev vc_port$I up
    sudo -n -- ip netns exec vc_ns$I ip addr add {{ip_prefix}}.$I/{{network_size}} dev vc_port$I
    sudo -n -- ip netns exec vc_ns$I ip link set dev vc_port$I mtu 1446
done
{% for peer in peers %}
sudo -n -- ovs-vsctl add-port vc_bridge vc_peer{{loop.index}} -- set interface vc_peer{{loop.index}} type=vxlan options:remote_ip={{peer}}
{% endfor %}
sudo -n -- ip addr add {{ip_prefix}}.254/{{network_size}} dev vc_bridge
sudo -n -- ovs-vsctl set bridge vc_bridge stp_enable=true
sudo -n -- ip link set vc_bridge up
"""
def prep(make_client, network, hosts, ips, skip_install=False):
    ips = min(int(ips), 250)
    host_ips = hosts_to_ips(hosts)
    network = ipaddress.ip_network(network, strict=True)
    ip_address = network.network_address
    for host in hosts:
        ip_prefix = '.'.join(str(ip_address).split('.')[:3])
        client = make_client(host)
        template = jinja2.Template(prep_template)
        script = template.render(
            ips_per_host=ips,
            ip_prefix=ip_prefix,
            network_size=network.prefixlen,
            peers=host_ips - set([get_net_ip(host)])
        )
        if not skip_install:
            client.run('sudo -n -- apt-get update')
            client.run('sudo -n -- apt-get -y install openvswitch-switch')
        client.run(script)
        ip_address += 256


reset_script = r"""
for NS in `ip netns | grep -P "vc_ns\d+"`; do
    export NS
    sudo -En -- bash -c 'find -L /proc/[1-9]*/ns/net -samefile /run/netns/$NS | cut -d/ -f3 | xargs kill -s 9 2>/dev/null'
    sudo -n -- ip netns del $NS
done
sudo -n -- ovs-vsctl del-br vc_bridge
"""
def reset(make_client, hosts):
    for host in hosts:
        client = make_client(host)
        client.run(reset_script)


run_template = """
for NS in `comm -12 <(ip netns list | sort) <(echo vc_ns{{indexlist}} | xargs -n 1 echo | sort) | sort -V`; do
    sudo -n -- ip netns exec $NS {{cmd}}
done
"""
def runns(make_client, hostgroups, cmd):
    for host, indexes in hostgroups.items():
        client = make_client(host)
        template = jinja2.Template(run_template)
        script = template.render(
            cmd=cmd,
            indexlist=indexes_as_list(indexes)
        )
        client.run(script)


ips_template = """
for NS in `comm -12 <(ip netns list | sort) <(echo vc_ns{{indexlist}} | xargs -n 1 echo | sort) | sort -V`; do
    sudo -n -- ip netns exec $NS ip -o -4 addr show | grep vc_port | awk '{print $4}' | cut -d/ -f1
done
"""
hosts_template = """
echo '{{hosts}}' > {{binpath}}.hosts.json
chmod +x {{binpath}}
"""
exe_template = """
for NS in `comm -23 <(ip netns list | grep -P "vc_ns\d+" | sort) <(echo vc_ns{{indexlist}} | xargs -n 1 echo | sort) | sort -V`; do
    export NS
    sudo -En -- bash -c 'comm -12 <(pgrep -f {{procname}}) <(find -L /proc/[1-9]*/ns/net -samefile /run/netns/$NS | cut -d/ -f3) | xargs kill -s 9 2>/dev/null'
done
IP_PREFIX=`ip -o -4 addr show | grep vc_bridge | awk '{print $4}' | cut -d\. -f1,2,3`
for NS in `comm -12 <(ip netns list | sort) <(echo vc_ns{{indexlist}} | xargs -n 1 echo | sort) | sort -V`; do
    export NS
    MATCHES=$(sudo -En -- bash -c 'comm -12 <(pgrep -f {{procname}}) <(find -L /proc/[1-9]*/ns/net -samefile /run/netns/$NS | cut -d/ -f3) | wc -l')
    if [ $MATCHES -eq 0 ]; then
        IP=$IP_PREFIX.`echo $NS | cut -c6-`
        sudo -n -- ip netns exec $NS nohup {{binpath}} {{args}} -hosts {{binpath}}.hosts.json --listen $IP:3000 > /tmp/$IP.out 2> /tmp/$IP.err < /dev/null &
    fi
done
"""
def exe(make_client, hostgroups, hosts, path, args):
    with open(path) as f:
        f_hash = hash_file(f)
    remote_path = '/tmp/%s' % f_hash
    if hostgroups:
        hostgroups = hostgroups[0]
    else:
        hostgroups = {}
    clients = {}
    all_ips = set()
    for host, indexes in hostgroups.items():
        clients[host] = client = make_client(host)
        template = jinja2.Template(ips_template)
        script = template.render(
            indexlist=indexes_as_list(indexes),
        )
        all_ips.update(filter(None, client.query(script).split('\n')))
    jhosts = json.dumps(['%s:3000' % h for h in sorted(all_ips)])
    for host in hostgroups:
        client = clients[host]
        client.copy(path, remote_path)
        template = jinja2.Template(hosts_template)
        script = template.render(
            hosts=jhosts,
            binpath=remote_path,
        )
        client.run(script)
    for h in hosts:
        if h not in hostgroups:
            hostgroups[h] = [500] # Hack to force cleanup
    for host, indexes in hostgroups.items():
        client = clients.get(host)
        if client is None:
            client = make_client(host)
        template = jinja2.Template(exe_template)
        script = template.render(
            indexlist=indexes_as_list(indexes),
            procname=f_hash,
            binpath=remote_path,
            args=args,
        )
        client.run(script)


def run_main():
    import docopt
    args = docopt.docopt(__doc__, version='0.1')

    make_client = functools.partial(
        virtualcluster.cmd.Client,
        verbose=args['--verbose'],
        dryrun=args['--dry-run'],
    )
    if args['prep']:
        prep(
            make_client,
            args['--network'],
            read_hosts(args),
            min(int(args['--ips']), 250),
            args['--skip-install']
        )
    if args['reset']:
        reset(
            make_client,
            read_hosts(args),
        )
    if args['runns']:
        runns(
            make_client,
            read_groups_or_hosts_as_groups(args),
            ' '.join(args['CMD']),
        )
    if args['exe']:
        exe(
            make_client,
            read_groups(args),
            read_hosts(args),
            args['PATH'],
            ' '.join(args['ARG']),
        )


def main():
    try:
        run_main()
    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
