package main

import "fmt"

func Example_virtualClusterGroups() {
	var hosts = []*Host{{"A", 10}, {"B", 5}, {"C", 10}}

	// skip 10 take 5 gets B
	fmt.Println(hostSlices(hosts, 10, 5))
	fmt.Println(hostSlices(hosts, 15, 10)) // C
	fmt.Println(hostSlices(hosts, 0, 25))  // all
	fmt.Println(hostSlices(hosts, 5, 15))  //

	_, err := hostSlices(hosts, 0, 26)
	fmt.Println(err)

	// Output:
	// [B[0:5]] <nil>
	// [C[0:10]] <nil>
	// [A[0:10] B[0:5] C[0:10]] <nil>
	// [A[5:10] B[0:5] C[0:5]] <nil>
	// session out of capacity
}

func Example_getRunningGroups() {
	var hosts = []*Host{{"A", 10}, {"B", 5}, {"C", 10}}

	str := "110001101111000110"
	running := make([]bool, len(str))
	for i, c := range str {
		running[i] = c == '1'
	}

	fmt.Println(runningGroups(hosts, running))

	// Output:
	// [A[0:2] A[5:7] A[8:10] B[0:2] C[0:2]] <nil>
}

func ExampleStartedHosts() {
	var hosts = []*Host{{"A", 10}, {"B", 5}, {"C", 10}}
	str := "0000000000111111111111111"
	running := make([]bool, len(str))
	for i, c := range str {
		running[i] = c == '1'
	}

	fmt.Println(startedHosts(hosts, running))
	// Output:
	// [10.10.1.1:3000 10.10.1.2:3000 10.10.1.3:3000 10.10.1.4:3000 10.10.1.5:3000 10.10.2.1:3000 10.10.2.2:3000 10.10.2.3:3000 10.10.2.4:3000 10.10.2.5:3000 10.10.2.6:3000 10.10.2.7:3000 10.10.2.8:3000 10.10.2.9:3000 10.10.2.10:3000]
}
