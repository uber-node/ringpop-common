# Partition Healing

In the original implementation of ringpop, if a cluster is split to multiple partitions, nodes in each partition declare each other as faulty, and afterward will no longer communicate. Ringpop implemented support for merging the partitions, which we call `healing`.

## Basic algorithm

In order for two partitions to heal, the algorithm does the following, periodically (this is the TLDR version of it; for the full algorithm, see below):

1. Randomly select a `faulty` node.
2. Send it a `/join` request, get its membership list.
3. If the local and retrieved lists are incompatible (merging them will introduce new faulties), mark all incompatible nodes suspect. When receiving this change the respective node will reassert that it is actually alive and update its incarnation number making it compatible for merge.
4. If the local and retrieved lists are compatible (merging them will not introduce new faulties), merge the membership list with the local node's membership and disseminate the changes.

We test this feature in 3 ways:

1. Unit tests asserting the correct behavior.
2. Integration tests, which will be the same for Go and Node implementations, checking the behavior of a node in isolation.
3. Manual acceptance test to see partitions actually getting healed.

## Detailed algorithm

This document describes a strategy to heal a partitioned ringpop cluster. The first section describes the mechanism a node triggers when it attempts to heal a partition, the second describes how, how often and when a node should trigger this mechanism.

### When and How Often

Executing the algorithm from the previous section on every tick doesn't scale well. The discovery provider will be overloaded and the amount of requests grows linearly with the cluster size. To deal with this issue, we introduce a separate timer that periodically ticks on a configurable duration `T`. Every tick, there is a probability `P` of executing the partition healing algorithm.

Let `N` be the number of hosts the previous query to the discovery provider has given us. If we, for example set `P = 3/N` and `T = 30 s`, we get on average 6 heal attempts per minute in the entire cluster, with a 95% probability that there is at least one heal attempt in 30 seconds. This means that we only query the discovery provider six times per minute regardless the size of the cluster.

### Configurables

* `T` -- partition healer execution interval, seconds. Configurable for application.
* `P` -- probability of executing the partition healing algorithm. Well-displayed constant in ringpop. Easily accessible for ringpop developers.

### Algorithm Flow

When a ringpop cluster is partitioned, some nodes are viewed alive by some nodes, and faulty by others. It's worth noting that the node, in both cases, has the same incarnation number. The goal of the heal algorithm is to make this node alive for all nodes. Since the faulty state has precedence over the alive state, we need to bump the incarnation number of the node for it to be accepted as alive by others; this has to be done on both sides.

#### Part 1 -- making memberships compatible

Goal of the first part is to make sure the membership lists of both partitions are _compatible_. That is, if they are merged according to the SWIM rules, no new faulty nodes shoul be created. To reach our goal we need to bump the incarnation numbers of nodes on both sides of the partition (because a state with a higher incarnation number always has precedence regardless of the status). Here's how we do it:

1. `c` (coordinator) downloads `t`'s (target's, in the other partition) membership list by doing a `/join` call.
2. `c` pings node `t` saying: the nodes that are faulty according to `c`, but alive according to `t`, are suspects. Then `t` will disseminate suspect messages to its own partition, and all nodes in `t`'s partition will reincarnate.
3. mark all `c`'s nodes suspect, and disseminate that information in `c`'s cluster. That will trigger the `c`'s partition to reincarnate.

After reincarnations are complete, the membership lists are compatible. Now we need to merge them.

#### Part 2 - merging memberships

When membership lists from both partitions are _compatible_, they can be merged, and no new faulty nodes will be induced. How?

1. `c` applies the membership list of `t` locally.
2. `c` disseminates the changes to its own partition (according to `c`'s partition, now `t`s partition is reachable).
3. `c` sends its membership to `t` over a ping, thus making `c`'s partition alive according to `t`.

#### Conclusion

Steps above describe how to heal two partitions in ringpop without inducing new faulty nodes and overloading the discovery provider.
