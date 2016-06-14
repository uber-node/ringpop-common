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
	"reflect"
	"time"
)

type AssertionType string

const (
	AssertionTypeIs = "is"
	AssertionTypeIn = "in"
)

type Assertion struct {
	Type AssertionType // can be is or in
	V1   Value
	V2   Value
}

// Can be a duration or a float64
type Value interface{}

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

	panic("unknown assertion type")
	return ""
}

func Assert(v Value, a *Assertion) error {
	if a == nil {
		return nil
	}

	switch a.Type {
	case AssertionTypeIs:

		if reflect.TypeOf(v) != reflect.TypeOf(a.V1) {
			return errors.New(fmt.Sprintf("assertion type mismatch %v %v", v, a.V1))
		}
		if reflect.DeepEqual(v, a.V1) {
			return nil
		}

		return errors.New(fmt.Sprintf("assertion failed got %v expected %v", v, a.V1))

	case AssertionTypeIn:
		if reflect.TypeOf(v) != reflect.TypeOf(a.V1) || reflect.TypeOf(v) != reflect.TypeOf(a.V2) {
			return errors.New(fmt.Sprintf("assertion type mismatch %v (%v,%v)", v, a.V1, a.V2))
		}

		switch v := v.(type) {
		case time.Duration:
			if v >= a.V1.(time.Duration) && v <= a.V2.(time.Duration) {
				return nil
			}
		case float64:
			if v >= a.V1.(float64) && v <= a.V2.(float64) {
				return nil
			}
		default:
			return errors.New(fmt.Sprint("no such value type %T", v))
		}

		return errors.New(fmt.Sprintf("assertion failed %v not in (%v,%v)", v, a.V1, a.V2))
	default:
		return errors.New(fmt.Sprintf("assertion type must be 'in' or 'is' but is %v", a))
	}

}
