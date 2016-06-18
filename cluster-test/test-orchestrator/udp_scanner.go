package main

import (
	"log"
	"net"
)

func NewUDPScanner(port string) *UDPScanner {
	// setup udp connection
	sAddr, err := net.ResolveUDPAddr("udp", ":"+port)
	if err != nil {
		return err
	}

	sConn, err := net.ListenUDP("udp", sAddr)
	if err != nil {
		return err
	}

	return &UDPScanner{
		buf: make([]byte, 1024),
	}
}

func (s *UDPScanner) Scan() bool {
	// read a single stat
	_, err := sConn.Read(buf)
	if err != nil {
		log.Fatalln(err)
		return false
	}

	text := string(buf)

	return true
}

func (s *UDPScanner) Text() string {
	return s.text
}
