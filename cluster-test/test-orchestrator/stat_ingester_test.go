package main

import (
	"bufio"
	"fmt"
	"strings"
)

type nopWriter struct{}

func (r nopWriter) Write(bts []byte) (int, error) {
	return len(bts), nil
}

func ExampleStatIngester() {
	si := NewStatIngester(nopWriter{})
	scanner := bufio.NewScanner(strings.NewReader(stats))
	si.IngestStats(scanner)
	fmt.Println(si.IsClusterStable(
		[]string{"172.18.24.220:3000", "172.18.24.220:3001", "172.18.24.220:3002"},
	))

	si = NewStatIngester(nopWriter{})
	scanner = bufio.NewScanner(strings.NewReader(stats))
	si.IngestStats(scanner)
	fmt.Println(si.IsClusterStable(
		[]string{"172.18.24.220:3000", "172.18.24.220:3001"},
	))

	// Output:
	// false
	// true
}

func ExampleWaitForStable() {
	si := NewStatIngester(nopWriter{})
	scanner := bufio.NewScanner(strings.NewReader(stats))
	si.IngestStats(scanner)
	si.WaitForStable(
		[]string{"172.18.24.220:3000", "172.18.24.220:3001"},
	)

	// Output:
}

var stats = `
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3000.changes.disseminate:0|g
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3001.changes.disseminate:0|g
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3002.changes.disseminate:0|g

2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3000.changes.disseminate:1|g
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3001.changes.disseminate:1|g
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3002.changes.disseminate:1|g

2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3000.changes.disseminate:0|g
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3001.changes.disseminate:0|g
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3002.changes.disseminate:1|g
`
