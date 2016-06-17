// Copyright (c) 2016 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// The file contains a utility for calculation expressions. This is useful when
// parsing the tests because when for example we want to assert that the
// number of suspect declarations in a split brane is equal to
// "N/2 * N/2 * 2" where N is the cluster size.

package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"strconv"

	"github.com/pkg/errors"
)

// Eval evaluates the value of an expression to a float64. It can be used
// as a simple calculator. e.g: `"2+3*4" -> 14.0`.
func Eval(expression string) (f float64, err error) {
	// recover from panic and change the err return value
	defer func() {
		if r := recover(); r != nil {
			err = errors.New(fmt.Sprint(r))
		}
	}()

	// parse expression
	expr, err := parser.ParseExpr(expression)
	if err != nil {
		msg := fmt.Sprintf("eval error for expression: \"%s\"", expression)
		return 0, errors.New(msg)
	}

	// evaluate expression
	return eval(expr), nil
}

// eval evaluates an ast.Expr, panicking when there is a problem.
// This function is called by Eval which recovers from the panics.
func eval(expr ast.Expr) float64 {
	switch e := expr.(type) {
	case *ast.ParenExpr:
		return eval(e.X)

	case *ast.BinaryExpr:
		return evalBin(e)

	case *ast.BasicLit:
		v, err := strconv.ParseFloat(e.Value, 64)
		if err != nil {
			panic(fmt.Sprintf("cannot convert BasicLit to float, %v", e))
		}
		return v
	}

	panic(fmt.Sprintf("calculator doesn't handle type %T", expr))
	return 0
}

// evalBin executes the binary operator "+", "-", "*" or "/" on two
func evalBin(expr *ast.BinaryExpr) float64 {
	x := eval(expr.X)
	y := eval(expr.Y)

	switch expr.Op.String() {
	case "*":
		return x * y
	case "/":
		return x / y
	case "+":
		return x + y
	case "-":
		return x - y
	}

	panic(fmt.Sprintf("unsupported operator %s", expr.Op))
	return 0
}
