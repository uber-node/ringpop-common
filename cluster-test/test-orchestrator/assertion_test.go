package main

import (
	"fmt"
	"time"
)

func ExampleIsAssertion() {
	a := &Assertion{AssertionTypeIs, 2 * time.Second, nil}
	fmt.Println(a)
	fmt.Println(a.Assert(2 * time.Second))
	fmt.Println(a.Assert(0 * time.Second).Error())
	fmt.Println(a.Assert(3 * time.Second).Error())
	fmt.Println()

	// Output:
	// is 2s
	// <nil>
	// FAILED assertion: expected 2s got 0
	// FAILED assertion: expected 2s got 3s
}

func ExampleInAssertion() {
	a := &Assertion{AssertionTypeIn, 1.0, 3.0}
	fmt.Println(a)
	fmt.Println(a.Assert(0.0))
	fmt.Println(a.Assert(1.0))
	fmt.Println(a.Assert(2.0))
	fmt.Println(a.Assert(3.0))
	fmt.Println(a.Assert(4.0))
	fmt.Println(a.Assert(2 * time.Second))

	// in (1,3)
	// FAILED assertion: 0 not in (1,3)
	// <nil>
	// <nil>
	// <nil>
	// FAILED assertion: 4 not in (1,3)
	// FAILED assertion: type mismatch 2s (1,3)
}
