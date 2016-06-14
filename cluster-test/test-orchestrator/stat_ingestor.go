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
	"bytes"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strings"
	"sync"
	"time"
)

type StatIngester struct {
	sync.Mutex
	emptyNodes  map[string]bool
	file        *os.File
	wasUnstable bool
}

func NewStatIngester() *StatIngester {
	return &StatIngester{
		emptyNodes: make(map[string]bool),
	}
}

func (si *StatIngester) WaitForStable(hosts []string) {
	// wait for cluster to become unstable
	for !si.wasUnstable {
		// fmt.Println("not unstable yet")
		time.Sleep(200 * time.Millisecond)
	}
	// fmt.Println("unstable")
	// wait for cluster to become stable
	for !si.IsClusterStable(hosts) {
		// count := 0
		// for _, h := range hosts {
		// 	e, ok := si.emptyNodes[h]
		// 	if ok && e {
		// 		count++
		// 	}
		// }
		// fmt.Println()
		// fmt.Println(count)
		// fmt.Println(si.emptyNodes)
		// fmt.Println(hosts)
		time.Sleep(200 * time.Millisecond)
	}
	si.wasUnstable = false
}

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

func (si *StatIngester) InsertLabel(label, cmd string) {
	writeln(si.file, []byte(fmt.Sprintf("label:%s|cmd: %s", label, cmd)))
}

func (si *StatIngester) Listen(file string, port string) error {
	// open output file
	f, err := os.Create(file)
	if err != nil {
		return err
	}
	si.file = f

	// start listening to stats
	sAddr, err := net.ResolveUDPAddr("udp", ":"+port)
	if err != nil {
		return err
	}

	sConn, err := net.ListenUDP("udp", sAddr)
	if err != nil {
		return err
	}

	go si.startIngestion()

	// handle stats
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := sConn.Read(buf)
			if err != nil {
				log.Fatalln(err)
			}
			if n == 0 {
				return
			}

			// write to file
			err = writeln(si.file, buf[0:n])
			if err != nil {
				log.Fatalln(err)
			}

			queue <- []byte(string(buf[0:n]))
		}
	}()

	return nil
}

var queue = make(chan []byte, 1024)

func (si *StatIngester) startIngestion() {
	for {
		str, open := <-queue
		if !open {
			fmt.Println("CLOSED")
			break
		}
		si.handleString(str)
	}
}

func (si *StatIngester) handleString(buf []byte) {
	si.Lock()
	defer si.Unlock()

	// check if changes were disseminated
	changes, ok := getBetween(buf, []byte("changes.disseminate:"), []byte("|"))
	if !ok {
		return
	}
	empty := changes == "0"

	// lookup hostport
	hostport, ok := getBetween(buf, []byte("ringpop."), []byte("."))
	if !ok {
		log.Fatalf("no hostport found in stat, ", string(buf))
	}

	if !empty {
		si.wasUnstable = true
	}
	si.emptyNodes[hostport] = empty
}

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