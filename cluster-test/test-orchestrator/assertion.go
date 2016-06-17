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

package main

import (
	"errors"
	"fmt"
	"log"
	"reflect"
	"time"
)

// An Assertion checks if a Value is equal or is contained by an interval.
type Assertion struct {
	Type AssertionType // can be is or in

	// This is the Value of the Assertion in case of AssertionTypeIs
	// or the first Value of the interval in case of AssertionTypeIn.
	V1 Value

	// The second Value of the interval in case of AssertionTypeIn.
	// This value is ignored in case of AssertionTypeIs.
	V2 Value
}

// AssertionType is the type (in or is) of an Assertion
type AssertionType string

const (
	// AssertionTypeIs is the type that is used for exact comparisons
	AssertionTypeIs AssertionType = "is"

	// AssertionTypeIn is the type that is used to check a value is containded
	// by an interval.
	AssertionTypeIn AssertionType = "in"
)

// String converts an assertion to its string representation. Some examples:
//
// - is 4
// - in (90, 110)
// - in (1s, 2s)
func (a *Assertion) String() string {
	if a == nil {
		return ""
	}
	if a.Type == AssertionTypeIs {
		return fmt.Sprintf("is %v", a.V1)
	}
	if a.Type == AssertionTypeIn {
		return fmt.Sprintf("in (%v,%v)", a.V1, a.V2)
	}

	log.Fatalf("Unknown assertion %s", a.Type)
	return ""
}

// Assert makes the assertion. Returns an error if the assertion failed.
func (a *Assertion) Assert(v Value) error {
	if a == nil {
		return nil
	}

	switch a.Type {
	case AssertionTypeIs:
		return equalsAssert(v, a.V1)
	case AssertionTypeIn:
		return rangeAssert(v, a.V1, a.V2)
	}

	msg := fmt.Sprintf("assertion type must be 'in' or 'is' but is %v", a.Type)
	return errors.New(msg)
}

// isAssert checks if the Values are equal and returns an error otherwise.
func equalsAssert(v, V1 Value) error {
	if reflect.DeepEqual(v, V1) {
		return nil
	}

	msg := fmt.Sprintf("assertion expected %v got %v ", V1, v)
	return errors.New(msg)
}

// inAssert checks if the Value is contained by the interval (V1, V2) and
// returns an error otherwise.
func rangeAssert(v, V1, V2 Value) error {
	// check if types match
	tv := reflect.TypeOf(v)
	tv1 := reflect.TypeOf(V1)
	tv2 := reflect.TypeOf(V2)
	if tv != tv1 || tv != tv2 {
		msg := fmt.Sprintf("assertion type mismatch %v (%v,%v)", v, V1, V2)
		return errors.New(msg)
	}

	// convert to float for easy comparison
	f := toFloat64(v)
	f1 := toFloat64(V1)
	f2 := toFloat64(V2)

	if f < f1 || f2 < f {
		msg := fmt.Sprintf("assertion %v not in (%v,%v)", v, V1, V2)
		return errors.New(msg)
	}

	return nil
}

// toFloat64 converts a value into a float64. Even is the value is a duration
// because time.Duration is a uint64 which we can convert to a float64.
func toFloat64(v Value) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return float64(v.(time.Duration))
}
