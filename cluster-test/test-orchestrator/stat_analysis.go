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

// This file contains the static ringpop stats analysis for: convergence time;
// number of converged checksums; and counting of individual stats.

package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"
)

const (
	membershipChecksumPath = ".checksum:"
	changesDisseminatePath = "changes.disseminate:"
	membershipSetPath      = "membership-set"
	hostportRegex          = "[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,6}"
)

// CountAnalysis counts the number of occurences of stat in the scanner.
func CountAnalysis(s Scanner, stat string) (int, error) {
	stat += ":"
	count := 0
	for s.Scan() {
		// TODO fetch actual count from stat line (don't just count number of lines)
		line := s.Text()
		if ok, err := regexp.MatchString(stat, line); ok && err == nil {
			num := line[strings.LastIndex(line, ":")+1 : len(line)-2]
			c, err := strconv.Atoi(num)
			fatalWhen(err)
			count += c
		}
	}
	if s.Err() != nil {
		return 0, errors.Wrap(s.Err(), "count analysis\n")
	}

	return count, nil
}

// ChecksumsAnalysis counts the number of unique checksums among nodes after
// scanning all the stats in the scanner.
func ChecksumsAnalysis(s Scanner, containsRing bool) (int, error) {
	m := make(map[string]string)
	for s.Scan() {
		line := s.Text()
		ix := strings.Index(line, membershipChecksumPath)

		// filter out everything that is not a membership/ring checksum
		if ix == -1 || containsRing != strings.Contains(line, "ring.checksum") {
			continue
		}

		csum := line[ix+len(membershipChecksumPath):]
		if csum[len(csum)-2:] != "|g" {
			msg := fmt.Sprintf("membership.checksum is not a gauge. csum=%s", csum)
			return 0, errors.New(msg)
		}
		csum = csum[:len(csum)-2]

		r := regexp.MustCompile(hostportRegex)
		host := r.FindString(line)
		if host == "" {
			msg := fmt.Sprintf("membership.checksum stat \"%s\" does not contain host", line)
			return 0, errors.New(msg)
		}
		m[host] = csum
	}
	if s.Err() != nil {
		return 0, errors.Wrap(s.Err(), "checksums analysis\n")
	}

	return uniq(m), nil
}

// uniq returns the number of unique values in a map.
func uniq(m map[string]string) int {
	u := make(map[string]struct{})
	for _, csum := range m {
		u[csum] = struct{}{}
	}
	return len(u)
}

// ConvergenceTimeAnalysis measures the time it takes from the first changes is
// applied until the last.
func ConvergenceTimeAnalysis(s Scanner) (time.Duration, error) {
	var firstChange string
	var lastChange string
	for s.Scan() {
		if strings.Contains(s.Text(), membershipSetPath) {
			firstChange = s.Text()
			lastChange = s.Text()
			break
		}
	}
	if firstChange == "" {
		return 0, errors.New("first membership change not found in convergence time analysis")
	}

	for s.Scan() {
		if strings.Contains(s.Text(), membershipSetPath) {
			lastChange = s.Text()
		}
	}
	if s.Err() != nil {
		return 0, errors.Wrap(s.Err(), "convergence time analysis\n")
	}

	d, err := timeDiff(firstChange, lastChange)
	if err != nil {
		return 0, errors.Wrap(err, "convergence time analaysis\n")
	}

	// force millisecond precission
	return d / time.Millisecond * time.Millisecond, nil
}

// timeDiff returns the duration between two stat lines.
func timeDiff(stat1, stat2 string) (time.Duration, error) {
	i1 := strings.Index(stat1, "|")
	if i1 == -1 {
		msg := fmt.Sprintf("stat1 \"%s\" doesn't contain a timestamp", stat1)
		return 0, errors.New(msg)
	}
	i2 := strings.Index(stat2, "|")
	if i2 == -1 {
		msg := fmt.Sprintf("stat2 \"%s\" doesn't contain a timestamp", stat2)
		return 0, errors.New(msg)
	}

	t1, err := time.Parse(time.RFC3339Nano, stat1[:i1])
	if err != nil {
		return 0, errors.Wrap(err, "parse timestamp stat1\n")
	}
	t2, err := time.Parse(time.RFC3339Nano, stat2[:i2])
	if err != nil {
		return 0, errors.Wrap(err, "parse timestamp stat2\n")
	}

	return t2.Sub(t1), nil
}
