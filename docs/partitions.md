# Partitions

In the original implementation of ringpop, if a cluster is split to multiple
partitions, nodes in each partition declare each other as faulty, and afterward
will no longer communicate. Ringpop implemented support for merging the
partitions, which we call `healing`.

## Partition Healing -- basic algorithm

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

## Forming a partition

With the current implementation of tick-cluster, it is non-trivial to form a
partition. To understand why, we need to understand how connections are
established.

### Port Allocation

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

### Manually forming a partition

The naïve approach to make a partition between `a` and `b` is to block incoming
connections from and to port `3000`: then no packet will leave `a`, and we will
have a partition. However, this misses the fact that ephemeral connections are
used for relaying traffic between nodes, and, in this case, connection from
`127.0.0.1:43323` (`a`) to `127.0.0.1:3001` is established and... misses the
firewall! We could block port `3001` too, but, with more nodes, that
would create a cluster with N partitions (N being the number of nodes) -- not
what we want. In our example, we want two partitions.

With that in mind, a bit more sophistication in firewall rules is required. To
easily create a partition in `tick-cluster` locally, we created
`tools/make_partitions`, which, by reading the state of the connections from
`lsof`, will emit `iptables`/`pf` commands accordingly.

In the example above, firewall rules to create a partition will look as follows
(OS X):

```
$ sudo lsof -Pnni | ./tools/make_partition 3000 3001 --platform darwin
block drop in proto tcp from 127.0.0.1 port 3000 flags S/S
block drop in proto tcp from 127.0.0.1 port 3001 flags S/S
block drop in proto tcp from 127.0.0.1 port 43323 to 127.0.0.1 port 3001
block drop in proto tcp from 127.0.0.1 port 3001 to 127.0.0.1 port 43323
block drop in proto tcp from 127.0.0.1 port 36113 to 127.0.0.1 port 3000
block drop in proto tcp from 127.0.0.1 port 3000 to 127.0.0.1 port 36113
```

Linux:

```
$ sudo lsof -Pnni | ./tools/make_partition 3000 3001 --platform linux
*filter
-A INPUT -p tcp -s 127.0.0.1 -d 127.0.0.1 --tcp-flags RST RST -j ACCEPT
-A INPUT -p tcp --syn -m state --state NEW -d 127.0.0.1 --dport 3000 -j REJECT --reject-with tcp-reset
-A INPUT -p tcp --syn -m state --state NEW -d 127.0.0.1 --dport 3001 -j REJECT --reject-with tcp-reset
-A INPUT -p tcp -s 127.0.0.1 --sport 43323 -d 127.0.0.1 --dport 3001 -j REJECT --reject-with tcp-reset
-A INPUT -p tcp -s 127.0.0.1 --sport 3001 -d 127.0.0.1 --dport 43323 -j REJECT --reject-with tcp-reset
-A INPUT -p tcp -s 127.0.0.1 --sport 36113 -d 127.0.0.1 --dport 3000 -j REJECT --reject-with tcp-reset
-A INPUT -p tcp -s 127.0.0.1 --sport 3000 -d 127.0.0.1 --dport 36113 -j REJECT --reject-with tcp-reset
COMMIT
```

To sum up:

* New connections to the listening ports (`3000`, `3001`) will be blocked. This
  prevents tchannel to re-open new valid connections.
* Relevant existing connections will be terminated (e.g. `3000` to ephemeral
  ports).
* Linux only: for the above to work, the firewall needs to explicitly accept
  `RST` packets.

During the partition, new connections to the nodes will be impossible to make.
This is important to keep in mind when using `ringpop-admin`: **invoke
ringpop-admin before forming the partition**.

Armed with background how this works, we can go and make a local partition:

### Start the tick-cluster

In this example, we use Node version of ringpop, but we can use `testpop` from
go too:

```shell
$ ./scripts/tick-cluster.js -n 4 ./main.js  # node
```

### Open the ringpop-admin to observe the cluster state

We shall open `ringpop-admin partitions` and `ringpop-admin top` before making the
partition. This way, the "management" connections will be open and status will
be visible during the partition:

```shell
$ ringpop-admin top 127.0.0.1:3000
$ ringpop-admin partitions -w 1 127.0.0.1:3000  # other terminal
```

`ringpop-admin top` will show something like this:

```
Address          P1
127.0.0.1:3000   alive
127.0.0.1:3001   alive
127.0.0.1:3002   alive
127.0.0.1:3003   alive
1 of 4
```

`ringpop-admin partitions` will show a single partition, updated every second:

```
10:27:09.615   Checksum    # Nodes   # Alive   # Suspect   # Faulty   Sample Host
               192859590   4         4         0           0          127.0.0.1:3000
10:27:10.607   Checksum    # Nodes   # Alive   # Suspect   # Faulty   Sample Host
               192859590   4         4         0           0          127.0.0.1:3000
```

### Start the partition

First, check how the firewall rules would look like before applying them to the
firewall (optionally, you can pass `--platform=darwin` or `--platform=linux` to
the `make_partition` script:

```shell
$ sudo lsof -Pnni | ./tools/make_partition 3000,3001 3002,3003
```

If you are happy with the output, apply the rules:

OS X:

```shell
$ sudo lsof -Pnni | ./tools/make_partition 3000,3001 3002,3003 | sudo pfctl -emf -
```

Linux:

```
$ sudo lsof -Pnni | ./tools/make_partition 3000,3001 3002,3003 | sudo iptables-restore
```

In a few seconds, you should see output from `tick-cluster` that some of the
nodes aren't able to ping each other. Let's verify we actuall have a partition.

### Checking in the tools

On partition, `ringpop-admin top` (opened before the partition) should display
something like this:

```
Address          P1       P2
127.0.0.1:3000   faulty   alive
127.0.0.1:3001   faulty   alive
127.0.0.1:3002   alive    faulty
127.0.0.1:3003   alive    faulty
```

`ringpop-admin partitions` (opened before forming a partition) shows a more
high-level view:

```
10:37:04.878   Checksum     # Nodes   # Alive   # Suspect   # Faulty   Sample Host
               400620880    2         2         0           2          127.0.0.1:3002
               3283514511   2         2         0           2          127.0.0.1:3000
```

That's it, we have a partition! To break it, we need to wipe the firewall rules:

* OS X: `pfctl -f /etc/pf.conf`.
* Linux: `iptables -F`.

... and wait for partition healing to kick in.

### Final remarks

* `tools/make_partition` can only create two partitions. It can work with
  arbitrary partition sizes; for usage, run `tools/make_partition --help`.
* `tools/make_partition` is not intended to be used in an automated way. See
  `--help` to learn about the limitations.
