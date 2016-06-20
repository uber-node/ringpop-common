package main

import "fmt"

func ExampleEval() {
	fmt.Println(Eval(""))
	fmt.Println(Eval("1s"))
	fmt.Println(Eval("2+(3*4"))
	fmt.Println(Eval("2+3*4)"))
	fmt.Println(Eval("(1.5+)*(3+4)"))

	fmt.Println(Eval("123"))
	fmt.Println(Eval("12.34"))
	fmt.Println(Eval("2+3*4"))
	fmt.Println(Eval("2*(3+5)"))
	fmt.Println(Eval("(1.5*3)*(3+4)"))
	fmt.Println(Eval("(1.5*(3))*(3+4)"))

	// Output:
	// 0 eval error for expression: ""
	// 0 eval error for expression: "1s"
	// 0 eval error for expression: "2+(3*4"
	// 0 eval error for expression: "2+3*4)"
	// 0 eval error for expression: "(1.5+)*(3+4)"
	// 123 <nil>
	// 12.34 <nil>
	// 14 <nil>
	// 16 <nil>
	// 31.5 <nil>
	// 31.5 <nil>

}
