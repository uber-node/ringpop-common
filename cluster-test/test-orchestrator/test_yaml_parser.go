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
	"bufio"
	"fmt"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v2"
)

type testYaml struct {
	// Config    configYaml
	Scenarios []*scenarioYaml
}

type configYaml struct {
	// TODO(wieger): define
}

type scenarioYaml struct {
	Name string
	Size string
	Desc string

	Script  []map[string]string
	Measure []string
	Runs    [][]string
}

func toScenarios(bts []byte) []*Scenario {
	testYaml := &testYaml{}
	err := yaml.Unmarshal([]byte(bts), testYaml)
	if err != nil {
		panic(fmt.Sprintf("error: %v", err))
	}

	return extractScenarios(testYaml)
}

func toCommand(label, cmdString string) Command {
	split := split(cmdString)
	if len(split) == 0 {
		panic(fmt.Sprintf("no command found for label: %v", label))
	}

	return Command{
		Label: label,
		Cmd:   split[0],
		Args:  split[1:],
	}
}

func toMeasurement(str string) Measurement {
	split := split(str)

	// extract assertion if it is there
	var assertion Assertion
	for i, s := range split {
		if s == "is" || s == "in" {
			a := toAssertion(split[i], strings.Join(split[i+1:], ""))
			assertion = a
			split = split[:i]
		}
	}

	if len(split) < 3 {
		fmt.Println(split)
		panic(fmt.Sprintf("a measure should contain at least a start and end label and a quantity to measure, %v", str))
	}

	return Measurement{
		Start:     split[0],
		End:       split[1],
		Quantity:  split[2],
		Args:      split[3:],
		Assertion: &assertion,
	}
}

func toAssertion(typ string, arg string) Assertion {
	a := Assertion{}
	switch typ {
	case "is":
		a.Type = AssertionTypeIs
	case "in":
		a.Type = AssertionTypeIn
	default:
		panic(fmt.Sprintf("no such assertion type %s", typ))
	}

	if a.Type == AssertionTypeIs {
		a.V1 = toValue(arg)
		return a
	}

	if arg[0] != '(' || arg[len(arg)-1] != ')' {
		panic(fmt.Sprintf("interval should be enclosed by parenthesis, %v", arg))
	}
	split := strings.Split(arg[1:len(arg)-1], ",")
	if len(split) != 2 {
		panic(fmt.Sprintf("interval should be split by a comma, %v", arg))
	}

	a.V1 = toValue(split[0])
	a.V2 = toValue(split[1])

	return a
}

func toValue(str string) Value {
	v, err := Eval(str)
	if err == nil {
		return v
	}

	d, err2 := time.ParseDuration(str)
	if err2 == nil {
		return Value(d)
	}

	panic(err.Error())
}

// split splits a whitespace separted string
func split(str string) []string {
	scanner := bufio.NewScanner(strings.NewReader(str))
	scanner.Split(bufio.ScanWords)

	var wrds []string
	for scanner.Scan() {
		wrds = append(wrds, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		panic(fmt.Sprintf("error while scanning command: %v", err))
	}

	return wrds
}

// returns a scenario for every element in the runs list
func extractScenarios(runs *testYaml) []*Scenario {
	result := make([]*Scenario, 0)
	for _, scenarioData := range runs.Scenarios {
		for i := 1; i < len(scenarioData.Runs); i++ {
			s := extractScenario(scenarioData, i)
			result = append(result, s)
		}
	}

	return result
}

func extractScenario(data *scenarioYaml, runIx int) *Scenario {
	varsData := data.Runs[0]
	runData := data.Runs[runIx]
	s := Scenario{}
	s.Name = replace(data.Name, varsData, runData)
	s.Desc = replace(data.Desc, varsData, runData)
	var err error
	s.Size, err = strconv.Atoi(replace(data.Size, varsData, runData))
	if err != nil {
		panic(fmt.Sprintf("size is not a valid integer: %v", err))
	}

	for _, cmdData := range data.Script {
		if len(cmdData) != 1 {
			panic(fmt.Sprintf("not a valid command should contain exactly one line: %v", cmdData))
		}
		for label, cmdString := range cmdData {
			cmd := toCommand(label, replace(cmdString, varsData, runData))
			s.Script = append(s.Script, cmd)
		}
	}

	for _, measureData := range data.Measure {
		m := toMeasurement(replace(measureData, varsData, runData))
		s.Measure = append(s.Measure, m)
	}

	return &s
}

func replace(str string, varsData []string, runData []string) string {
	if len(varsData) != len(runData) {
		panic(fmt.Sprintf("Run %v doesn't have correct amount of variables for %v", runData, varsData))
	}
	for i := range varsData {
		str = strings.Replace(str, varsData[i], runData[i], -1)
	}
	return str
}
