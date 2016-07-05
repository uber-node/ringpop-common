package main

import "fmt"

func Example_virtualClusterGroups() {
	var vhosts = []*VHost{{"A", 10}, {"B", 5}, {"C", 10}}

	// skip 10 take 5 gets B
	fmt.Println(hostSlices(vhosts, 10, 5))
	fmt.Println(hostSlices(vhosts, 15, 10)) // C
	fmt.Println(hostSlices(vhosts, 0, 25))  // all
	fmt.Println(hostSlices(vhosts, 5, 15))  //

	_, err := hostSlices(vhosts, 0, 26)
	fmt.Println(err)

	// Output:
	// [B[0:5]] <nil>
	// [C[0:10]] <nil>
	// [A[0:10] B[0:5] C[0:10]] <nil>
	// [A[5:10] B[0:5] C[0:5]] <nil>
	// session out of capacity
}

func Example_getRunningGroups() {
	var vhosts = []*VHost{{"A", 10}, {"B", 5}, {"C", 10}}

	str := "110001101111000110"
	running := make([]bool, len(str))
	for i, c := range str {
		running[i] = c == '1'
	}

	fmt.Println(runningGroups(vhosts, running))

	// Output:
	// [A[0:2] A[5:7] A[8:10] B[0:2] C[0:2]] <nil>
}
