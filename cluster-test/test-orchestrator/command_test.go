package main

import "fmt"

func Example_getBatches() {
	fmt.Println(getBatches(10, 2))
	fmt.Println(getBatches(9, 2))

	//Output:
	// [[0 1] [2 3] [4 5] [6 7] [8 9]]
	// [[0 1] [2 3] [4 5] [6 7] [8]]
}

func Example_groupsToIndices() {

}

func Example_toGroupSize() {

}
