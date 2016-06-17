package main

import (
	"fmt"
	"time"
)

func ExampleAssertion() {
	a := Assertion{AssertionTypeIn, time.Second, time.Second * 3}
	fmt.Println(a)

	// Output:
}
