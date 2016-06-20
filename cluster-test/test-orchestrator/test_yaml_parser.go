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
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"

	"gopkg.in/yaml.v2"
)

// testYaml is used to unmarshal test declared in the yaml files.
type testYaml struct {
	Config    configYaml
	Scenarios []*scenarioYaml
}

type configYaml struct {
	// TODO(wieger): define
}

// scenarioYaml captures the information of a scenario.
type scenarioYaml struct {
	Name string
	Size string
	Desc string

	Script  []map[string]string
	Measure []string
	Runs    [][]string
}

func parse(bts []byte) (scns []*Scenario, err error) {
	defer func() {
		if r := recover(); r != nil {
			scns = nil
			err = errors.New(fmt.Sprint(r))
		}
	}()

	return parseScenarios(bts), nil
}

func parseScenarios(bts []byte) []*Scenario {
	testYaml := &testYaml{}
	err := yaml.Unmarshal([]byte(bts), testYaml)
	if err != nil {
		panic("failed to unmarshal scenario yaml")
	}

	return extractScenarios(testYaml)
}

// extractScenarios returns a scenario for every element in the runs list.
func extractScenarios(runs *testYaml) []*Scenario {
	var result []*Scenario
	for _, scenarioData := range runs.Scenarios {
		for i := 1; i < len(scenarioData.Runs); i++ {
			s := extractScenario(scenarioData, i)
			result = append(result, s)
		}
	}

	return result
}

// extractScenario returns a scenario given the index of a specific run.
func extractScenario(data *scenarioYaml, runIx int) *Scenario {
	varsData := data.Runs[0]
	runData := data.Runs[runIx]
	defer wrapPanicf("Failed to parse scenario '%s'", data.Name)
	defer wrapPanicf("in run %d, [%v] = [%v]", runIx, strings.Join(varsData, ", "), strings.Join(runData, ", "))

	if len(varsData) != len(runData) {
		msg := fmt.Sprintf("var count of run %v should match var count of %v", runData, varsData)
		panic(msg)
	}

	// don't find and replace on name
	name := data.Name
	desc := replace(data.Desc, varsData, runData)
	sizeStr := replace(data.Size, varsData, runData)

	// extract size
	size, err := strconv.Atoi(sizeStr)
	if err != nil {
		panic("size convert: " + err.Error())
	}

	// extract script
	labels, cmds := extractScript(data.Script, varsData, runData)
	script := parseScript(labels, cmds)

	// extract Measure
	var measureStrs []string
	for _, measureStr := range data.Measure {
		measureStrs = append(measureStrs, replace(measureStr, varsData, runData))
	}
	measure := parseMeasure(measureStrs)

	return &Scenario{
		Name:    name,
		Desc:    desc,
		Size:    size,
		Script:  script,
		Measure: measure,
	}
}

func extractScript(script []map[string]string, varsData, runData []string) (labels, cmds []string) {
	for _, cmdData := range script {
		if len(cmdData) != 1 {
			msg := fmt.Sprintf("\"%v\" is not a valid command, should contain exactly one entry", cmdData)
			panic(msg)
		}

		for label, cmd := range cmdData {
			labels = append(labels, replace(label, varsData, runData))
			cmds = append(cmds, replace(cmd, varsData, runData))
		}
	}
	return labels, cmds
}

func parseScript(labels, cmdStrs []string) []*Command {
	defer wrapPanicf("in parse script")
	var cmds []*Command
	for i := range labels {
		cmd := parseCommand(labels[i], cmdStrs[i])
		cmds = append(cmds, cmd)
	}

	return cmds
}

func parseCommand(label, cmdString string) *Command {
	defer wrapPanicf("in parse command '%s: %s'", label, cmdString)
	split := split(cmdString)
	if len(split) == 0 {
		panic("empty command")
	}

	return &Command{
		Label: label,
		Cmd:   split[0],
		Args:  split[1:],
	}
}

func parseMeasure(msData []string) []*Measurement {
	var ms []*Measurement
	for _, mData := range msData {
		ms = append(ms, parseMeasurement(mData))
	}
	return ms
}

func parseMeasurement(str string) *Measurement {
	defer wrapPanicf("in parse measure '%s'", str)

	split := split(str)
	var measurementArgs = split

	if len(split) < 3 {
		panic("contains too few fields")
	}

	// search for assertion
	var assertion *Assertion
	for i, s := range split {
		if s == "is" || s == "in" {
			interval := strings.Join(split[i+1:], "")
			assertion = parseAssertion(split[i], interval)
			measurementArgs = split[3:i]
		}
	}

	return &Measurement{
		Start:     split[0],
		End:       split[1],
		Quantity:  split[2],
		Args:      measurementArgs,
		Assertion: assertion,
	}
}

func parseAssertion(typStr string, arg string) *Assertion {
	defer wrapPanicf("in parse assertion '%s %s'", typStr, arg)

	switch typStr {
	case "is":
		typ := AssertionTypeIs
		v := parseValue(arg)
		return &Assertion{
			Type: typ,
			V1:   v,
		}

	case "in":
		typ := AssertionTypeIn
		v1, v2 := parseRange(arg)
		return &Assertion{
			Type: typ,
			V1:   v1,
			V2:   v2,
		}
	}

	panic("not valid assertion type")
}

func parseRange(rng string) (v1, v2 Value) {
	defer wrapPanicf("in parse range '%s'", rng)

	if rng[0] != '(' || rng[len(rng)-1] != ')' {
		panic("should be enclosed by parenthesis")
	}
	split := strings.Split(rng[1:len(rng)-1], ",")
	if len(split) != 2 {
		panic("should be split by a comma")
	}

	v1 = parseValue(split[0])
	v2 = parseValue(split[1])

	if reflect.TypeOf(v1) != reflect.TypeOf(v2) {
		panic(fmt.Sprintf("types %T %T should be equal", v1, v2))
	}

	return v1, v2
}

func parseValue(str string) Value {
	defer wrapPanicf("in parse value '%s", str)

	// First check if the input is a numer or expression.
	v, err := Eval(str)
	if err == nil {
		return v
	}

	// Then check if the input is a duration. Duration check needs
	// to be after Eval to prevent "0" to parse as a duration.
	d, err := time.ParseDuration(str)
	if err == nil {
		return Value(d)
	}

	panic("value is not a number duration or expression")
}

// split splits a whitespace separted string
func split(str string) []string {
	defer wrapPanicf("in split '%s'", str)

	scanner := bufio.NewScanner(strings.NewReader(str))
	scanner.Split(bufio.ScanWords)

	var wrds []string
	for scanner.Scan() {
		wrds = append(wrds, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		panic(err)
	}

	return wrds
}

// replace finds occurrences of varsData and replaces them by the respective
// element in the runsData.
func replace(str string, varsData []string, runData []string) string {
	for i := range varsData {
		str = strings.Replace(str, varsData[i], runData[i], -1)
	}
	return str
}

func wrapPanicf(format string, args ...interface{}) {
	if r := recover(); r != nil {
		msg := fmt.Sprintf(format, args...)
		panic(fmt.Sprintf("%s:\n- %v", msg, r))
	}
}
