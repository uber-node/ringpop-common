package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/pkg/errors"
)

type VCClient struct {
	Running     []bool
	Hosts       []*Host
	TestpopPath string
	VCPath      string
}

type Host struct {
	Name string
	Cap  int
}

func NewVCClient(vcPath, testpopPath string, hosts []*Host) *VCClient {
	return &VCClient{
		VCPath:      vcPath,
		TestpopPath: testpopPath,
		Hosts:       hosts,
	}
}

func (vc *VCClient) StartRunning(ix int) {
	vc.Running[ix] = true
}

func (vc *VCClient) StopRunning(ix int) {
	vc.Running[ix] = false
}

func (vc *VCClient) Reset() error {
	args := []string{"reset" /*TODO(wieger):, "-i", "250"*/}
	for _, host := range vc.Hosts {
		args = append(args, "-H"+host.Name)
	}

	// fmt.Println("CMD:", vc.VCPath, args)
	cmd := exec.Command(vc.VCPath, args...)
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (vc *VCClient) Prep() error {
	args := []string{"prep" /*TODO(wieger):, "-i", "250"*/}
	for _, host := range vc.Hosts {
		args = append(args, "-H"+host.Name)
	}

	// fmt.Println("CMD:", vc.VCPath, args)
	cmd := exec.Command(vc.VCPath, args...)
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (vc *VCClient) Exe() error {
	args := []string{"exe"}
	for _, host := range vc.Hosts {
		args = append(args, "-H"+host.Name)
	}

	groups, err := runningGroups(vc.Hosts, vc.Running)
	if err != nil {
		return errors.Wrap(err, "in exe")
	}
	if len(groups) > 0 {
		args = append(args, "-g")
		args = append(args, strings.Join(groups, ","))
	}

	args = append(args, "--", vc.TestpopPath, "--stats-udp=10.10.0.254:3300")

	// fmt.Println("CMD:", vc.VCPath, args)
	cmd := exec.Command(vc.VCPath, args...)
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (vc *VCClient) SwitchBinaries(path string) {
	vc.TestpopPath = path
}

func startedHosts(hosts []*Host, running []bool) []string {
	var result []string

	i, j := 0, 0
	for _, r := range running {
		if r {
			result = append(result, fmt.Sprintf("10.10.%d.%d:3000", i, j+1))
		}

		j++
		for j == hosts[i].Cap {
			j = 0
			i++
			if i == len(hosts) {
				return result
			}
		}
	}

	return result
}

func runningGroups(hosts []*Host, running []bool) ([]string, error) {
	// group by consecutive running nodes storing their start and end indices.
	var groupStart, groupEnd []int
	for i := range running {
		if running[i] && (i == 0 || !running[i-1]) {
			groupStart = append(groupStart, i)
		}
		if len(groupEnd) == len(groupStart) {
			continue
		}
		if !running[i] && running[i-1] {
			groupEnd = append(groupEnd, i)
		}
	}
	if len(groupStart) != len(groupEnd) {
		groupEnd = append(groupEnd, len(running))
	}

	var result []string
	for i := range groupStart {
		start := groupStart[i]
		size := groupEnd[i] - groupStart[i]

		slices, err := hostSlices(hosts, start, size)
		if err != nil {
			//TODO(wieger)
		}
		result = append(result, slices...)
	}

	return result, nil
}

// func virtualClusterGroup(hosts []*Host, skip int, groupSize int) (string, error) {
// 	group, err := getHostSlices(hosts, skip, groupSize)
// 	if err != nil {
// 		return "", err
// 	}
// 	return fmt.Sprintf("-g%s", group), nil
// }

func hostSlices(hosts []*Host, skip int, groupSize int) ([]string, error) {
	if len(hosts) == 0 {
		return nil, errors.New("session out of capacity")
	}

	if hosts[0].Cap <= skip {
		return hostSlices(hosts[1:], skip-hosts[0].Cap, groupSize)
	}

	startIx := skip
	endIx := skip + groupSize
	if endIx > hosts[0].Cap {
		endIx = hosts[0].Cap
	}

	slice := fmt.Sprintf("%s[%d:%d]", hosts[0].Name, startIx, endIx)
	if groupSize <= endIx-startIx {
		return []string{slice}, nil
	}

	rest, err := hostSlices(hosts[1:], 0, groupSize-(endIx-startIx))
	if err != nil {
		return nil, err
	}

	return append([]string{slice}, rest...), nil
}
