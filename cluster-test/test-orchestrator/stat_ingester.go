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

// This file contains is responsible for ingesting the ringpop stats of the
// entire cluster. The stats are analyzed in real-time to assess cluster
// stability and the stats are at the same time written to a file for later
// analysis.

package main

import (
	"fmt"
	"io"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/pkg/errors"
)

// The StatIngester is a UDP server that accepts ringpop stats with added
// timestamps. The StatIngester analyzes the stream so that it knows when the
// cluster reaches a stable state. It also writes the stream into a file for
// later analysis.
type StatIngester struct {
	// The where the stats are written to.
	writer io.Writer

	// Protects emptyNodes and wasUnstable
	sync.Mutex

	// The stat ingester listens for dissemination stats to determine if the
	// cluster has reached a stable state. When there are no changes being
	// disseminated by any node, the cluster is said to be stable.
	// emptyNodes holds track of which nodes are empty and which nodes still
	// have changes to disseminate.
	emptyNodes map[string]bool

	// When waiting for the cluster to be stable, we first want to make sure
	// that the cluster was unstable at some point. This makes sure that any
	// failure condition we throw at the cluster has taken effect before we
	// move onto the next failure condition.
	wasUnstable bool
}

// NewStatIngester creates a new StatIngester
func NewStatIngester(w io.Writer) *StatIngester {
	return &StatIngester{
		emptyNodes: make(map[string]bool),
		writer:     w,
	}
}

// WaitForStable blocks and waits until the cluster has reached a stable state.
// waits for the cluster to first become unstable if it isn't already, and then
// blocks until the cluster has reached a stable state again.
func (si *StatIngester) WaitForStable(hosts []string) {
	// wait for cluster to become unstable
	for !si.wasUnstable {
		time.Sleep(200 * time.Millisecond)
	}
	// wait for cluster to become stable
	for !si.IsClusterStable(hosts) {
		time.Sleep(200 * time.Millisecond)
	}
	si.wasUnstable = false
}

// IsClusterStable indicates, judging from the processed stats, whether the
// cluster is in a stable state. The input are the hosts that should be
// alive.
func (si *StatIngester) IsClusterStable(hosts []string) bool {
	si.Lock()
	defer si.Unlock()

	for _, h := range hosts {
		hs := strings.Replace(h, ".", "_", -1)
		hs = strings.Replace(hs, ":", "_", -1)
		if empty, ok := si.emptyNodes[hs]; !ok || !empty {
			return false
		}
	}
	return true
}

// IngestStats starts listening on the specified port for ringpop stats. The
// stats are analyzed to determine cluster-stability and written to a file.
func (si *StatIngester) IngestStats(s Scanner) error {
	for s.Scan() {
		withTime := fmt.Sprintf("%s|%s", time.Now().UTC().Format(time.RFC3339Nano), s.Text())

		// handle stat for cluster stability analysis
		err := si.handleStat(withTime)
		if err != nil {
			err = errors.Wrap(err, "stat ingestion")
			log.Fatalf(err.Error())
		}

		// write stat to file
		_, err = fmt.Fprintln(si.writer, withTime)
		if err != nil {
			log.Fatalln(err)
		}
	}

	return nil
}

// InsertLabel writes a line like "label:t0|cmd: kill 1" into the stats file.
// The line indicates at what time a command is run. The idea is that all stats
// that are recorded between two labels can be used to measure the effect of
// the command associated with the first label.
func (si *StatIngester) InsertLabel(label, cmd string) {
	fmt.Fprintf(si.writer, "label:%s|cmd: %s\n", label, cmd)
}

// handleStat handles a single stat to determine cluster-stability.
func (si *StatIngester) handleStat(str string) error {
	si.Lock()
	defer si.Unlock()

	// check if changes were disseminated
	changes, ok := getBetween(str, "changes.disseminate:", "|")
	if !ok {
		return nil
	}
	empty := changes == "0"

	// lookup hostport
	hostport, ok := getBetween(str, "ringpop.", ".")
	if !ok {
		msg := fmt.Sprintf("no hostport found in stat \"%s\"", str)
		return errors.New(msg)
	}

	if !empty {
		si.wasUnstable = true
	}
	si.emptyNodes[hostport] = empty

	return nil
}

// getBetween get a substring from the input buffer between before and after.
// The function returns whether this was a success.
func getBetween(str, before, after string) (string, bool) {
	start := strings.Index(str, before)
	if start == -1 {
		return "", false
	}
	start += len(before)

	end := strings.Index(str[start:], after)
	if end == -1 {
		return "", false
	}

	return str[start : start+end], true
}
