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
	"bytes"
	"fmt"
	"io"
	"log"
	"net"
	"os"
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
	// The file where the stats are written to.
	file *os.File

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
func NewStatIngester() *StatIngester {
	return &StatIngester{
		emptyNodes: make(map[string]bool),
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

// InsertLabel writes a line like "label:t0|cmd: kill 1" into the stats file.
// The line indicates at what time a command is run. The idea is that all stats
// that are recorded between two labels can be used to measure the effect of
// the command associated with the first label.
func (si *StatIngester) InsertLabel(label, cmd string) {
	writeln(si.file, []byte(fmt.Sprintf("label:%s|cmd: %s", label, cmd)))
}

// handleStat handles a single stat for cluster-stability analysis.
func (si *StatIngester) handleStat(buf []byte) error {
	si.Lock()
	defer si.Unlock()

	// check if changes were disseminated
	changes, ok := getBetween(buf, []byte("changes.disseminate:"), []byte("|"))
	if !ok {
		return nil
	}
	empty := changes == "0"

	// lookup hostport
	hostport, ok := getBetween(buf, []byte("ringpop."), []byte("."))
	if !ok {
		msg := fmt.Sprintf("no hostport found in stat \"%s\"", string(buf))
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
func getBetween(buf, before, after []byte) (string, bool) {
	start := bytes.Index(buf, before)
	if start == -1 {
		return "", false
	}
	buf = buf[start+len(before):]

	end := bytes.Index(buf, after)
	if end == -1 {
		return "", false
	}

	return string(buf[:end]), true
}

// Listen starts listening on the specified port for ringpop stats. The stats
// are analyzed to determine cluster-stability and written to a file.
func (si *StatIngester) Listen(file string, port string) error {
	// open output file
	f, err := os.Create(file)
	if err != nil {
		return err
	}
	si.file = f

	// setup udp connection
	sAddr, err := net.ResolveUDPAddr("udp", ":"+port)
	if err != nil {
		return err
	}

	sConn, err := net.ListenUDP("udp", sAddr)
	if err != nil {
		return err
	}

	// listen to and handle stats that come through the udp connection
	go func() {
		buf := make([]byte, 1024)
		for {
			// read a single stat
			n, err := sConn.Read(buf)
			if err != nil {
				log.Fatalln(err)
			}
			if n == 0 {
				return
			}

			// handle stat for cluster stability analysis
			err = si.handleStat(buf[0:n])
			if err != nil {
				err = errors.Wrap(err, "stat ingestion\n")
				log.Fatalf(err.Error())
			}

			// write stat to file
			err = writeln(si.file, buf[0:n])
			if err != nil {
				log.Fatalln(err)
			}
		}
	}()

	return nil
}

// writeln is a helper function that writes one line to the writer.
func writeln(w io.Writer, bts []byte) error {
	n, err := w.Write(bts)
	if err != nil {
		return err
	}
	if n != len(bts) {
		return errors.New("not all bytes were written")
	}

	newLine := []byte("\n")
	n, err = w.Write(newLine)
	if err != nil {
		return err
	}
	if n != len(newLine) {
		return errors.New("not all bytes were written")
	}

	return nil
}
