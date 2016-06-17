package main

import (
	"bufio"
	"fmt"
	"strings"
)

// Check that a section scanner get's the stats between the time labels t0 and t1
func ExampleSectionScanner() {
	s := bufio.NewScanner(strings.NewReader(stats))
	scanner, _ := NewSectionScanner(s, "t0", "t1")

	for scanner.Scan() {
		fmt.Println(scanner.Text())
	}

	// Output:
	// 2016-06-15T16:11:08.246816444Z|ringpop.172_18_24_220_3000.protocol.frequency:200.833341|ms
	// 2016-06-15T16:11:08.246954825Z|ringpop.172_18_24_220_3000.protocol.delay:200|ms
	// 2016-06-15T16:11:08.247013319Z|ringpop.172_18_24_220_3000.changes.disseminate:0|g
	// 2016-06-15T16:11:08.247032205Z|ringpop.172_18_24_220_3000.ping.send:1|c
	// 2016-06-15T16:11:08.247344365Z|ringpop.172_18_24_220_3008.ping.recv:1|c
}

func ExampleCountAnalysis() {
	s := bufio.NewScanner(strings.NewReader(stats))
	c1, _ := CountAnalysis(s, "ping.send")
	s = bufio.NewScanner(strings.NewReader(stats))
	c2, _ := CountAnalysis(s, "changes.disseminate")
	fmt.Println(c1, c2)

	// Output:
	// 2 4
}

var stats = `
2016-06-15T16:11:08.198146603Z|ringpop.172_18_24_220_3007.protocol.delay:200|ms
2016-06-15T16:11:08.198191045Z|ringpop.172_18_24_220_3007.changes.disseminate:0|g
2016-06-15T16:11:08.198212784Z|ringpop.172_18_24_220_3007.ping.send:1|c
2016-06-15T16:11:08.198622397Z|ringpop.172_18_24_220_3000.ping.recv:1|c
2016-06-15T16:11:08.198694026Z|ringpop.172_18_24_220_3000.changes.disseminate:0|g
2016-06-15T16:11:08.19884693Z|ringpop.172_18_24_220_3007.ping:0.593162|ms
label:t0|cmd: kill 1
2016-06-15T16:11:08.246816444Z|ringpop.172_18_24_220_3000.protocol.frequency:200.833341|ms
2016-06-15T16:11:08.246954825Z|ringpop.172_18_24_220_3000.protocol.delay:200|ms
2016-06-15T16:11:08.247013319Z|ringpop.172_18_24_220_3000.changes.disseminate:0|g
2016-06-15T16:11:08.247032205Z|ringpop.172_18_24_220_3000.ping.send:1|c
2016-06-15T16:11:08.247344365Z|ringpop.172_18_24_220_3008.ping.recv:1|c
label:t1|cmd: wait-for-stable
2016-06-15T16:11:08.247388872Z|ringpop.172_18_24_220_3008.changes.disseminate:0|g
2016-06-15T16:11:08.247506122Z|ringpop.172_18_24_220_3000.ping:0.447996|ms
2016-06-15T16:11:08.25451275Z|ringpop.172_18_24_220_3003.protocol.frequency:203.362966|ms
2016-06-15T16:11:08.254576313Z|ringpop.172_18_24_220_3003.protocol.delay:200|ms
`

func ExampleChecksumAnalysis() {
	s := bufio.NewScanner(strings.NewReader(csumStats))
	csums, _ := ChecksumsAnalysis(s)
	fmt.Println(csums)

	// Output:
	// 3
}

var csumStats = `
2016-06-17T11:29:18.254046798Z|ringpop.172_18_24_192_3005.checksum:4321|g
2016-06-17T11:29:18.254046798Z|ringpop.172_18_24_192_3002.checksum:1234|g
2016-06-17T11:29:18.254046798Z|ringpop.172_18_24_192_3000.checksum:1000|g
2016-06-17T11:29:18.254046798Z|ringpop.172_18_24_192_3001.checksum:1234|g
2016-06-17T11:29:18.254046798Z|ringpop.172_18_24_192_3003.checksum:1234|g
2016-06-17T11:29:18.254046798Z|ringpop.172_18_24_192_3004.checksum:4321|g
2016-06-17T11:29:18.254046798Z|ringpop.172_18_24_192_3006.checksum:4321|g
`

func ExampleConvergenceTimeAnalysis() {
	s := bufio.NewScanner(strings.NewReader(convtimeStats))
	convtime, _ := ConvergenceTimeAnalysis(s)
	fmt.Println(convtime)

	// Output:
	// 8s
}

// time between the first and last recoreded change is 8 seconds
var convtimeStats = `
2016-06-17T11:29:15.0Z|ringpop.172_18_24_192_3000.noise
2016-06-17T11:29:16.0Z|ringpop.172_18_24_192_3000.noise
2016-06-17T11:29:17.0Z|ringpop.172_18_24_192_3000.noise
2016-06-17T11:29:18.0Z|ringpop.172_18_24_192_3000.membership-set.suspect:1|c
2016-06-17T11:29:19.0Z|ringpop.172_18_24_192_3001.membership-set.suspect:1|c
2016-06-17T11:29:20.0Z|ringpop.172_18_24_192_3002.membership-set.suspect:1|c
2016-06-17T11:29:21.0Z|ringpop.172_18_24_192_3002.membership-set.suspect:1|c
2016-06-17T11:29:21.0Z|ringpop.172_18_24_192_3000.noise
2016-06-17T11:29:21.0Z|ringpop.172_18_24_192_3000.noise
2016-06-17T11:29:22.0Z|ringpop.172_18_24_192_3003.membership-set.suspect:1|c
2016-06-17T11:29:23.0Z|ringpop.172_18_24_192_3003.membership-set.suspect:1|c
2016-06-17T11:29:24.0Z|ringpop.172_18_24_192_3003.membership-set.suspect:1|c
2016-06-17T11:29:25.0Z|ringpop.172_18_24_192_3004.membership-set.suspect:1|c
2016-06-17T11:29:26.0Z|ringpop.172_18_24_192_3005.membership-set.suspect:1|c
2016-06-17T11:29:27.0Z|ringpop.172_18_24_192_3000.noise
2016-06-17T11:29:28.0Z|ringpop.172_18_24_192_3000.noise
2016-06-17T11:29:29.0Z|ringpop.172_18_24_192_3000.noise
`
