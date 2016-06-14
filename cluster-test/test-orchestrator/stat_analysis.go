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
	"log"
	"regexp"
	"strings"
	"time"
)

const (
	membershipChecksumPath = ".checksum:"
	changesDisseminatePath = "changes.disseminate:"
	membershipSetPath      = "membership-set"
	hostportRegex          = "[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,6}"
)

// StatCount counts the number of occurences of stat in the scanner.
func StatCount(s Scanner, stat string) int {
	stat += ":"
	count := 0
	for s.Scan() {
		// TODO fetch count from stat line (don't just count number of lines)
		if ok, err := regexp.MatchString(stat, s.Text()); ok && err == nil {
			count++
		}
	}
	if s.Err() != nil {
		panic(s.Err())
	}

	return count
}

// StatChecksums counts the number of unique checksums among nodes after
// scanning all the stats in the scanner.
func StatChecksums(s Scanner) int {
	m := make(map[string]string)
	for s.Scan() {
		line := s.Text()
		ix := strings.Index(line, membershipChecksumPath)
		if ix == -1 || strings.Contains(line, "ring.checksum") {
			continue
		}

		csum := line[ix+len(membershipChecksumPath):]
		if csum[len(csum)-2:] != "|g" {
			panic("membership.checksum is not a gauge. csum=" + csum)
		}
		csum = csum[:len(csum)-2]

		r := regexp.MustCompile(hostportRegex)
		host := r.FindString(line)
		if host == "" {
			panic("membership.checksum stat does not contain host")
		}
		m[host] = csum
	}
	if s.Err() != nil {
		panic(s.Err())
	}

	return uniq(m)
}

// uniq returns the number of unique values in a map.
func uniq(m map[string]string) int {
	u := make(map[string]struct{})
	for _, csum := range m {
		u[csum] = struct{}{}
	}
	return len(u)
}

// StatConvergenceTime measures the time it takes from the first changes until the
func StatConvergenceTime(s Scanner) time.Duration {
	var firstChange string
	for s.Scan() {
		if strings.Contains(s.Text(), membershipSetPath) {
			firstChange = s.Text()
			break
		}
	}

	var lastChange string
	for s.Scan() {
		if strings.Contains(s.Text(), membershipSetPath) {
			lastChange = s.Text()
		}

		// changes, ok := getBetween([]byte(s.Text()), []byte(changesDisseminatePath), []byte("|"))
		// if ok && changes != "0" {
		// 	lastChange = s.Text()
		// }
	}
	if s.Err() != nil {
		panic(s.Err())
	}

	if firstChange == "" || lastChange == "" {
		return 0
	}

	d := timeDiff(firstChange, lastChange)
	// foce millisecond precission
	return d / time.Millisecond * time.Millisecond
}

func timeDiff(stat1, stat2 string) time.Duration {
	i1 := strings.Index(stat1, "|")
	if i1 == -1 {
		log.Fatal("stat1 didn't contain a timestamp, ", stat1)
	}
	i2 := strings.Index(stat2, "|")
	if i2 == -1 {
		log.Fatal("stat2 didn't contain a timestamp, ", stat2)
	}

	s1 := stat1[:i1]
	s2 := stat2[:i2]

	t1, err := time.Parse(time.RFC3339Nano, s1)
	if err != nil {
		log.Fatal("stat didn't contain a timestamp, ", err)
	}
	t2, err := time.Parse(time.RFC3339Nano, s2)
	if err != nil {
		log.Fatal("stat didn't contain a timestamp, ", err)
	}

	return t2.Sub(t1)
}
