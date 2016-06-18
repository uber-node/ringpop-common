package main

import (
	"net"

	"github.com/pkg/errors"
)

type UDPScanner struct {
	buf   []byte
	text  string
	err   error
	sConn *net.UDPConn
}

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

func (s *UDPScanner) Text() string {
	return s.text
}

func (s *UDPScanner) Err() error {
	return s.err
}
