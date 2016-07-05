import ipaddress
import os
import socket
import subprocess

import paramiko


def Client(hostname, verbose=False, dryrun=False):
    ip = socket.gethostbyname(hostname)
    if ipaddress.IPv4Address(ip).is_loopback:
        return LocalClient(hostname, verbose=verbose, dryrun=dryrun)
    return SSHClient(hostname, verbose=verbose, dryrun=dryrun)


class LocalClient:
    def __init__(self, hostname, verbose=False, dryrun=False):
        self.hostname = hostname
        self.verbose, self.dryrun = verbose, dryrun

    def run(self, cmd):
        return self._run(cmd, side_effects=True)

    def query(self, cmd):
        return self._run(cmd, side_effects=False)

    def _run(self, cmd, side_effects):
        if self.verbose:
            print('%s$' % self.hostname),
            print('(query)' if not side_effects else '')
            for line in cmd.split('\n'):
                print('\t%s' % line)
        output = None
        if not self.dryrun or (self.dryrun and not side_effects):
            p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            err = p.stderr.read().decode('unicode_escape')
            if err:
                print(err)
            output = p.stdout.read().decode('unicode_escape')
            p.wait()
        return output

    def copy(self, local_path, remote_path):
        if self.verbose:
            print('%s$\n\tcopying %s to %s' % (self.hostname, local_path, remote_path))
        if self.dryrun:
            return
        verbose, self.verbose = self.verbose, False
        self.run('cp %s %s' % (local_path, remote_path))
        self.verbose = verbose


class SSHClient:
    def __init__(self, hostname, verbose=False, dryrun=False):
        self.hostname = hostname
        self.verbose, self.dryrun = verbose, dryrun
        self.client = paramiko.SSHClient()
        self.client.load_system_host_keys()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        config_path = os.path.expanduser('~/.ssh/config')
        if not os.path.isfile(config_path):
            self.client.connect(hostname)
            return
        config = paramiko.SSHConfig()
        config.parse(open(config_path))
        host = config.lookup(hostname)
        if 'proxycommand' in host:
            proxy = paramiko.ProxyCommand(
                subprocess.check_output(
                    [os.environ['SHELL'], '-c', 'echo %s' % host['proxycommand']]
                ).strip()
            )
        else:
            proxy = None
        port = (host.get('port') and int(host['port'])) or 22
        username = host.get('user')
        self.client.connect(host['hostname'], port=port, username=username, sock=proxy)

    def run(self, cmd):
        return self._run(cmd, side_effects=True)

    def query(self, cmd):
        return self._run(cmd, side_effects=False)

    def _run(self, cmd, side_effects):
        cmd = '\n'.join(filter(None, cmd.split('\n')))
        if self.verbose:
            print('%s$' % self.hostname),
            print('(query)' if not side_effects else '')
            for line in cmd.split('\n'):
                print('\t%s' % line)
        output = None
        if not self.dryrun or (self.dryrun and not side_effects):
            _, o, e = self.client.exec_command(cmd)
            err = e.read().decode('unicode_escape')
            if err:
                print(err)
            output = o.read().decode('unicode_escape')
        return output

    def copy(self, local_path, remote_path):
        if self.verbose:
            print('%s$\n\tcopying %s to %s' % (self.hostname, local_path, remote_path))
        if self.dryrun:
            return
        sftp = self.client.open_sftp()
        try:
            sftp.stat(remote_path)
        except:
            sftp.put(local_path, remote_path)
        sftp.close()
