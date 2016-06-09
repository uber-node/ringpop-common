#!/usr/bin/env python
"""
Network Shaper

Usage:
    ns per_connection [--verbose] [--dry-run] <condition> <port_group>...
    ns per_host [--heal] [--verbose] [--dry-run] <condition> <host_group>...
    ns reset
    ns graph <port>...
    ns -h | --help


Options:
    --verbose           Print SSH commands and output
    --dry-run           Don't run any SSH commands
"""
from __future__ import print_function

import itertools
import pprint
import socket
import sys

import jinja2
import yaml

import clustershaper.cmd


def get_pid_to_port(ports):
    client = clustershaper.cmd.Client('localhost')
    csv_ports = ','.join(map(str, ports))
    to_run = 'lsof -Pni4TCP:%s -sTCP:LISTEN -Fpn' % csv_ports
    output = client.run(to_run)
    output = filter(None, output.split('\n'))
    pid_to_port = {}
    pid = None
    for line in output:
        if line.startswith('p'):
            pid = int(line[1:])
        elif line.startswith('n'):
            port = int(line.split(':')[1])
            if port not in ports:
                continue
            if pid in pid_to_port:
                raise ValueError('Single PID listening to multiple ports')
            pid_to_port[pid] = port
    return pid_to_port


def build_graph(ports):
    pid_to_port = get_pid_to_port(ports)
    client = clustershaper.cmd.Client('localhost')
    csv_ports = ','.join(map(str, ports))
    to_run = 'lsof -Pni4TCP:%s -sTCP:ESTABLISHED -Fpn' % csv_ports
    output = client.run(to_run)
    output = filter(None, output.split('\n'))
    graph = {}
    pid = None
    for line in output:
        if line.startswith('p'):
            pid = int(line[1:])
        if pid not in pid_to_port:
            continue
        if line.startswith('n'):
            ephemeral, server = line.split('->')
            server_port = int(server.split(':')[1])
            if server_port not in ports:
                continue
            key = pid_to_port[pid], server_port
            eport = int(ephemeral.split(':')[1])
            graph.setdefault(key, []).append(eport)
    return graph


def show_graph(ports):
    ports = set(map(int, ports))
    graph = build_graph(ports)
    pprint.pprint(graph)
    try:
        as_dot(graph)
    except ImportError:
        raise ValueError('Could not draw graph')

def as_dot(graph):
    from graphviz import Digraph
    dot = Digraph(comment='Cluster', engine='circo')
    for (start, end), ephemerals in graph.items():
        for ephemeral in ephemerals:
            dot.edge(str(start), str(end), label=str(ephemeral))
    dot.render('/tmp/cluster', view=True)


per_connection_template = """
tc qdisc add dev lo root handle 1: drr
tc class add dev lo parent 1: classid 1:1 drr
tc class add dev lo parent 1:1 classid 1:10 drr
tc class add dev lo parent 1:1 classid 1:20 drr
tc qdisc add dev lo parent 1:10 handle 10: netem {{condition}}
tc qdisc add dev lo parent 1:20 handle 20: netem
{% for sport, dport in port_pairs %}
tc filter add dev lo parent 1:0 protocol ip prio 1 u32 match ip sport {{sport}} 0xffff match ip dport {{dport}} 0xffff flowid 1:10
{% endfor %}
tc filter add dev lo parent 1:0 protocol ip prio 1 u32 match ip dst 0.0.0.0/0 flowid 1:20
"""
def per_connection(condition, port_groups, verbose=False, dryrun=False):
    all_ports = set()
    port_groups = [list(map(int, g.split(','))) for g in port_groups]
    for port_group in port_groups:
        all_ports.update(port_group)
    if not len(all_ports) == sum(map(len, port_groups)):
        raise ValueError('Ports are repeated')
    graph = build_graph(all_ports)
    port_pairs = []
    for g1, g2 in itertools.combinations(port_groups, 2):
        for p1, p2 in itertools.product(g1, g2):
            for eport in graph.get((p1, p2), []):
                port_pairs.append((eport, p2))
                port_pairs.append((p2, eport))
            for eport in graph.get((p2, p1), []):
                port_pairs.append((eport, p1))
                port_pairs.append((p1, eport))
    t = jinja2.Template(per_connection_template)
    script = t.render(
        condition=condition,
        port_pairs=port_pairs
    )
    client = clustershaper.cmd.Client('localhost', verbose=verbose, dryrun=dryrun)
    client.run_script(script)


per_host_template = """
sudo tc qdisc add dev {{device}} root handle 1: htb
sudo tc class add dev {{device}} parent 1: classid 1:1 htb rate 1000Mbps
sudo tc class add dev {{device}} parent 1:1 classid 1:11 htb rate 1000Mbps
sudo tc qdisc add dev {{device}} parent 1:11 handle 10: netem {{condition}}
{% for h in other_hosts %}
sudo tc filter add dev {{device}} protocol ip prio 1 u32 match ip dst {{h}} flowid 1:11
{% endfor %}
"""
def per_host(condition, host_groups, heal=False, verbose=False, dryrun=False):
    all_hosts = set()
    host_groups = [host_group.split(',') for host_group in host_groups]
    for host_group in host_groups:
        all_hosts.update(host_group)
    if not len(all_hosts) == sum(map(len, host_groups)):
        raise ValueError('Hosts are repeated')
    if heal:
        for host in all_hosts:
            client = clustershaper.cmd.Client(host, verbose=verbose, dryrun=dryrun)
            client.run('tc qdisc del dev eth0 root')
        return
    hosts = {}
    for g1, g2 in itertools.combinations(host_groups, 2):
        for h1, h2 in itertools.product(g1, g2):
            h1_ip = socket.gethostbyname(h1)
            h2_ip = socket.gethostbyname(h2)
            hosts.setdefault(h1, []).append(h2_ip)
            hosts.setdefault(h2, []).append(h1_ip)
    t = jinja2.Template(per_host_template)
    for host, other_hosts in hosts.items():
        client = clustershaper.cmd.Client(host, verbose=verbose, dryrun=dryrun)
        script = t.render(
            condition=condition,
            other_hosts=other_hosts,
            device='eth0'
        )
        client.run_script(script)


def run_main():
    import docopt
    args = docopt.docopt(__doc__, version='0.1')
    if args['graph']:
        show_graph(args['<port>'])
    if args['per_connection']:
        per_connection(args['<condition>'], args['<port_group>'], args['--verbose'], args['--dry-run'])
    if args['per_host']:
        per_host(args['<condition>'], args['<host_group>'], args['--heal'], args['--verbose'], args['--dry-run'])


def main():
    try:
        run_main()
    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)

main = run_main

if __name__ == '__main__':
    main()
