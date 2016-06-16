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

func parseScenarios(bts []byte) ([]*Scenario, error) {
	testYaml := &testYaml{}
	err := yaml.Unmarshal([]byte(bts), testYaml)
	if err != nil {
		return nil, errors.Wrap(err, "failed to parse scenario\n")
	}

	scns, err := extractScenarios(testYaml)
	if err != nil {
		return nil, errors.Wrap(err, "failed to parse scenario\n")
	}

	return scns, nil
}

// extractScenarios returns a scenario for every element in the runs list.
func extractScenarios(runs *testYaml) ([]*Scenario, error) {
	result := make([]*Scenario, 0)
	for _, scenarioData := range runs.Scenarios {
		for i := 1; i < len(scenarioData.Runs); i++ {
			s, err := extractScenario(scenarioData, i)
			if err != nil {
				vars := strings.Join(scenarioData.Runs[0], ", ")
				run := strings.Join(scenarioData.Runs[i], ", ")
				err = errors.Wrapf(err, "run %d, [%s] = [%s]\n", i, vars, run)
				err = errors.Wrapf(err, "scenario \"%s\"\n", scenarioData.Name)
				return nil, err
			}
			result = append(result, s)
		}
	}

	return result, nil
}

// extractScenario returns a scenario given the index of a specific run.
func extractScenario(data *scenarioYaml, runIx int) (*Scenario, error) {
	varsData := data.Runs[0]
	runData := data.Runs[runIx]
	if len(varsData) != len(runData) {
		msg := fmt.Sprintf("var count of run %v should match var count of %v", runData, varsData)
		return nil, errors.New(msg)
	}

	// don't do find and replace on name
	name := data.Name
	desc := replace(data.Desc, varsData, runData)
	sizeStr := replace(data.Size, varsData, runData)

	// extract size
	size, err := strconv.Atoi(sizeStr)
	if err != nil {
		return nil, errors.Wrapf(err, "size \"%s\"\n", sizeStr)
	}

	// extract Script
	var labels, cmds []string
	for _, cmdData := range data.Script {
		if len(cmdData) != 1 {
			msg := fmt.Sprintf("\"%v\" is not a valid command, should contain exactly entry", cmdData)
			return nil, errors.New(msg)
		}

		for label, cmd := range cmdData {
			labels = append(labels, replace(label, varsData, runData))
			cmds = append(cmds, replace(cmd, varsData, runData))
		}
	}
	script, err := parseScript(labels, cmds)
	if err != nil {
		return nil, err
	}

	// extract Measure
	var measureStrs []string
	for _, measureStr := range data.Measure {
		measureStrs = append(measureStrs, replace(measureStr, varsData, runData))
	}
	measure, err := parseMeasure(measureStrs)
	if err != nil {
		return nil, err
	}

	return &Scenario{
		Name:    name,
		Desc:    desc,
		Size:    size,
		Script:  script,
		Measure: measure,
	}, nil
}

func parseScript(labels, cmdStrs []string) ([]*Command, error) {
	var cmds []*Command
	for i := range labels {
		cmd, err := parseCommand(labels[i], cmdStrs[i])
		if err != nil {
			return nil, errors.Wrapf(err, "script line %d\n", i+1)
		}
		cmds = append(cmds, cmd)
	}

	return cmds, nil
}

func parseCommand(label, cmdString string) (*Command, error) {
	split, err := split(cmdString)
	if err != nil {
		return nil, errors.Wrapf(err, "command \"%s:%s\"\n", label, cmdString)
	}
	if len(split) == 0 {
		msg := fmt.Sprintf("no command found for label \"%s\"", label)
		return nil, errors.New(msg)
	}

	return &Command{
		Label: label,
		Cmd:   split[0],
		Args:  split[1:],
	}, nil
}

func parseMeasure(msData []string) ([]*Measurement, error) {
	var ms []*Measurement
	for i, mData := range msData {
		m, err := parseMeasurement(mData)
		if err != nil {
			return nil, errors.Wrapf(err, "measure #%d\n", i+1)
		}
		ms = append(ms, m)
	}
	return ms, nil
}

func parseMeasurement(str string) (*Measurement, error) {
	split, err := split(str)
	if err != nil {
		return nil, errors.Wrapf(err, "measurement \"%s\"\n", str)
	}
	var measurementArgs = split

	if len(split) < 3 {
		msg := fmt.Sprintf("measurement \"%s\" contains too few fields", str)
		return nil, errors.New(msg)
	}

	// extract assertion if it is there
	var assertion *Assertion
	for i, s := range split {
		if s == "is" || s == "in" {
			interval := strings.Join(split[i+1:], "")
			assertion, err = parseAssertion(split[i], interval)
			if err != nil {
				return nil, errors.Wrapf(err, "measurement \"%s\"\n", str)
			}
			measurementArgs = split[3:i]
		}
	}

	return &Measurement{
		Start:     split[0],
		End:       split[1],
		Quantity:  split[2],
		Args:      measurementArgs,
		Assertion: assertion,
	}, nil
}

func parseAssertion(typStr string, arg string) (*Assertion, error) {
	switch typStr {
	case "is":
		typ := AssertionTypeIs
		v, err := parseValue(arg)
		if err != nil {
			return nil, errors.Wrapf(err, "assertion")
		}
		return &Assertion{
			Type: typ,
			V1:   v,
		}, nil

	case "in":
		typ := AssertionTypeIn
		v1, v2, err := parseRange(arg)
		if err != nil {
			return nil, errors.Wrapf(err, "assertion")
		}
		return &Assertion{
			Type: typ,
			V1:   v1,
			V2:   v2,
		}, nil
	}

	msg := fmt.Sprintf("parse assertion error: \"%s\" is not a valid assertion type", typStr)
	return nil, errors.New(msg)
}

func parseRange(rng string) (Value, Value, error) {
	if rng[0] != '(' || rng[len(rng)-1] != ')' {
		msg := fmt.Sprintf("range \"%s\" should be enclosed by parenthesis", rng)
		return nil, nil, errors.New(msg)
	}
	split := strings.Split(rng[1:len(rng)-1], ",")
	if len(split) != 2 {
		msg := fmt.Sprintf("range \"%s\" should be split by a comma", rng)
		return nil, nil, errors.New(msg)
	}

	v1, err := parseValue(split[0])
	if err != nil {
		return nil, nil, errors.Wrapf(err, "range \"%s\"\n", rng)
	}
	v2, err := parseValue(split[1])
	if err != nil {
		return nil, nil, errors.Wrapf(err, "range \"%s\"\n", rng)
	}
	if reflect.TypeOf(v1) != reflect.TypeOf(v2) {
		msg := fmt.Sprintf("types in range \"%s\" should be equal", rng)
		return nil, nil, errors.New(msg)
	}

	return v1, v2, nil
}

func parseValue(str string) (Value, error) {
	// First check if the input is a numer or expression.
	v, err := Eval(str)
	if err == nil {
		return v, nil
	}

	// Then check if the input is a duration. Duration check needs
	// to be after Eval to prevent "0" to parse as a duration.
	d, err := time.ParseDuration(str)
	if err == nil {
		return Value(d), nil
	}

	msg := fmt.Sprintf("value \"%s\" is not a number, duration or expression", str)
	return nil, errors.New(msg)
}

// split splits a whitespace separted string
func split(str string) ([]string, error) {
	scanner := bufio.NewScanner(strings.NewReader(str))
	scanner.Split(bufio.ScanWords)

	var wrds []string
	for scanner.Scan() {
		wrds = append(wrds, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return nil, errors.Wrapf(err, "split \"%s\"\n", str)
	}

	return wrds, nil
}

// replace finds occurrences of varsData and replaces them by the respective
// element in the runsData.
func replace(str string, varsData []string, runData []string) string {
	for i := range varsData {
		str = strings.Replace(str, varsData[i], runData[i], -1)
	}
	return str
}
