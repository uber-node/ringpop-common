# Partitions

In the original implementation of ringpop, if a cluster is split to multiple
partitions, nodes in each partition declare each other as faulty, and afterward
will no longer communicate. Ringpop implemented support for merging the
partitions, which we call `healing`.

## Introduction -- basic algorithm

In order for two partitions to heal, the algorithm does the following,
periodically (some details are omitted for brevity; exact algorithm can be
found in the code comments in the implementation):

1. Randomly select a `faulty` node.
2. Send it a `/join` request, get its membership list.
3. If the local and retrieved lists are incompatible (merging them will
   introduce new faulties), mark all incompatible nodes suspect. When receiving
   this change the respective node will reassert that it is actually alive and
   update its incarnation number making it compatible for merge.
4. If the local and retrieved lists are compatible (merging them will not
   introduce new faulties), merge the membership list with the local node's
   membership and disseminate the changes.

We test this feature in 3 ways:

1. Unit tests asserting the correct behavior.
2. Integration tests, which will be the same for Go and Node implementations,
   checking the behavior of a node in isolation.
3. Manual acceptance test to see partitions actually getting healed.

Further down, we will talk about how to manually create a partition and confirm
it heals itself.

## Port allocation

With the current implementation of tick-cluster, it is hard, or even impossible
to form a partition with firewall rules alone. To understand why, we need to
understand how connections are established.

A ringpop instance opens a local tchannel socket (=listening tcp socket) to
accept incoming connections from other ringpops. By default, on a 2-node
tick-cluster, this is `127.0.0.1:3000`. Let's call it instance `a`. For
instance `a` to establish a connection to instance `b` (`127.0.0.1:3001`),
instance `a` will open an ephemeral port, e.g. `43323`, to connect to instance
`b`. This connection, from `127.0.0.1:43323` (`a`) to `127.0.0.1:3001` (`b`) is
used for messages initiated by node `a`. The other connection (example below),
from `127.0.0.1:36113` (`b`) to `127.0.0.1:3000` (`a`), is used for messages
initiated by `b`. Here is a snapshot of `lsof` from a two-node cluster:

```
root:/# lsof -Pnni
COMMAND PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node     64 root   10u  IPv4 217924      0t0  TCP 127.0.0.1:3000 (LISTEN)
node     64 root   11u  IPv4 217925      0t0  TCP 127.0.0.1:43323->127.0.0.1:3001 (ESTABLISHED)
node     64 root   12u  IPv4 217926      0t0  TCP 127.0.0.1:3000->127.0.0.1:36113 (ESTABLISHED)
node     66 root   10u  IPv4 219916      0t0  TCP 127.0.0.1:3001 (LISTEN)
node     66 root   11u  IPv4 219917      0t0  TCP 127.0.0.1:36113->127.0.0.1:3000 (ESTABLISHED)
node     66 root   12u  IPv4 219918      0t0  TCP 127.0.0.1:3001->127.0.0.1:43323 (ESTABLISHED)
root:/#
```

Armed with this knowledge, we can try to make a partition.

## Forming a partition

The naïve approach to make a partition between `a` and `b` is to block incoming
connections from and to port `3000`: then no packet will leave `a`, and we will
have a partition. However, this misses the fact that ephemeral connections are
used for relaying traffic between nodes, and, in this case, connection from
`127.0.0.1:43323` (`a`) to `127.0.0.1:3001` is established and... misses the
firewall! We could block port `3001` too, but, with more nodes, that
would create a cluster with N partitions (N being the number of nodes) -- not
what we want. In our example, we want two partitions.

To restrict traffic between two sets of nodes, the following alternative
approaches were investigated:

1. Put each process to a cgroup, and block traffic based on the cgroup id
   ([more information][1]). This would work without changes to `tick-cluster`,
   however, as of beginning of 2016, it was non-trivial to find a Linux
   distribution which supports both iptables rules for cgroups and kernel
   support out of the box.
2. Change `tick-cluster` to bind to separate IPs, rather than ports. E.g.
   `127.0.0.1:3000` for `a`, `127.0.0.2:3000` for `b`, etc. Then it is easy to
   write firewall rules that work per IP. We tried this too, but turns out
   tchannel is not very selective about the source IPs of the ephemeral
   connections. In the end, this didn't work neither for Node, nor for Go.
3. Spawn two clusters on two or more physical machines, and connect them
   together.

In the end, we settled with (3).

[1]: https://lwn.net/Articles/569678/
