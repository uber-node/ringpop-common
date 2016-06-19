package main

import (
	"net"

	"github.com/pkg/errors"
)

// UDPScanner listens to a port for udp messages and converts them so that they
// can be read through the Scanner interface.
type UDPScanner struct {
	buf   []byte
	text  string
	err   error
	sConn *net.UDPConn
}

// NewUDPScanner starts listening on the specified port and returns a new
// UDPScanner.
func NewUDPScanner(port string) (*UDPScanner, error) {
	// setup udp connection
	sAddr, err := net.ResolveUDPAddr("udp", ":"+port)
	if err != nil {
		return nil, errors.Wrap(err, "udp scanner")
	}

	sConn, err := net.ListenUDP("udp", sAddr)
	if err != nil {
		return nil, errors.Wrap(err, "udp scanner")
	}

	return &UDPScanner{
		buf:   make([]byte, 1024),
		sConn: sConn,
	}, nil
}

// Scans the next line, and returns whether there is one.
func (s *UDPScanner) Scan() bool {
	// read a single stat
	n, err := s.sConn.Read(s.buf)
	if err != nil {
		s.err = errors.Wrap(err, "udp scan")
		return false
	}

	s.text = string(s.buf[0:n])

	return true
}

// Returns the scanned line.
func (s *UDPScanner) Text() string {
	return s.text
}

// Returns whether an error occured during scanning.
func (s *UDPScanner) Err() error {
	return s.err
}
