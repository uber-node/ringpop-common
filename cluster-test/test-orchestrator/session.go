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
	"os"
	"os/exec"
	"strings"

	"gopkg.in/yaml.v2"
)

// A Session is a structure that is used to communicate with virtual-cluster.
// It is used to bootstrap, start and stop testpop nodes.
type Session struct {
	vcBin string

	// Used to Unmarshal yaml data
	Object map[interface{}]*struct {
		Bridge *struct {
			Device string
			Iface  string
			Peers  []*struct {
				Device string
				Host   string
			}
		}

		VHosts []*struct {
			Device    string
			Iface     string
			Namespace string
			Running   bool
		}
	}
}

// NewSession queries virtual-cluster program for a new session object.
func NewSession(vcBin string, cfg *configYaml) (*Session, error) {
	//TODO(wieger): Config to args for vc new
	seshBts, err := exec.Command(vcBin, "new", "10.10.0.0/16", "localhost/30").Output()
	if err != nil {
		return nil, err
	}

	s := &Session{}
	err = yaml.Unmarshal(seshBts, &s.Object)
	if err != nil {
		return nil, err
	}

	s.vcBin = vcBin
	return s, nil
}

// Prepare communicates to virtual-cluster that it needs to prepare the
// cluster that is described in the Session.
func (s *Session) Prepare() error {
	s.Reset()

	cmd := exec.Command(s.vcBin, "prepare", "--verbose", "--sudo", "./testpop")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	s.writeToCmdStdin(cmd)
	return cmd.Run()
}

func (s *Session) Reset() error {
	cmd := exec.Command(s.vcBin, "reset", "--verbose", "--sudo")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	s.writeToCmdStdin(cmd)
	return cmd.Run()
}

// Apply communicates to virtual-cluster that it needs to apply the given
// Session. This is usually done after the Session object is mutated by
// starting or stopping nodes.
func (s *Session) Apply() error {
	cmd := exec.Command(s.vcBin, "apply", "--sudo", "--", "--stats-udp", "10.10.255.254:3300")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	s.writeToCmdStdin(cmd)
	return cmd.Run()
}

// writeToCmdStdin writes the Session as yaml to the stdin of the command that
// runs virtual-cluster.
func (s *Session) writeToCmdStdin(cmd *exec.Cmd) error {
	in, err := yaml.Marshal(s.Object)
	if err != nil {
		return err
	}
	wc, err := cmd.StdinPipe()
	if err != nil {
		return err
	}

	_, err = wc.Write(in)
	if err != nil {
		return err
	}

	return wc.Close()
}

// StartedHosts returns a list of hosts that have target: "started".
func (s *Session) StartedHosts() []string {
	var ret []string
	for _, h := range s.Object {
		for _, vh := range h.VHosts {
			if !vh.Running {
				continue
			}
			split := strings.Split(vh.Iface, "/")
			ret = append(ret, split[0]+":"+ringpopPort)
		}
	}

	return ret
}

// StartAll marks all nodes with target: "started" in the Session object.
func (s *Session) StartAll() {
	for _, host := range s.Object {
		for _, vh := range host.VHosts {
			vh.Running = true
		}
	}
}

// StopAll marks all nodes with target: "stopped" in the Session object.
func (s *Session) StopAll() {
	for _, host := range s.Object {
		for _, vh := range host.VHosts {
			vh.Running = false
		}
	}
}

// Start marks n stopped nodes with target: "started" in the Session object.
func (s *Session) Start(n int) bool {
	for _, host := range s.Object {
		for _, vh := range host.VHosts {
			if vh.Running {
				continue
			}
			vh.Running = true

			n--
			if n == 0 {
				return true
			}
		}
	}
	return false
}

// Stop marks n started nodes with target: "stopped" in the Session object.
func (s *Session) Stop(n int) bool {
	for _, host := range s.Object {
		for _, vh := range host.VHosts {
			if !vh.Running {
				continue
			}
			vh.Running = false

			n--
			if n == 0 {
				return true
			}
		}
	}
	return false
}
