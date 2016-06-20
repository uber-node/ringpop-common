import ipaddress
import os
import socket
import subprocess

import paramiko


def Client(hostname, verbose=False, dryrun=False, sudo=False):
    ip = socket.gethostbyname(hostname)
    if ipaddress.IPv4Address(ip).is_loopback:
        return LocalClient(hostname, verbose=verbose, dryrun=dryrun, sudo=sudo)
    return SSHClient(hostname, verbose=verbose, dryrun=dryrun, sudo=sudo)


class LocalClient:
    def __init__(self, hostname, verbose=False, dryrun=False, sudo=False):
        self.hostname = hostname
        self.verbose, self.dryrun, self.sudo = verbose, dryrun, sudo

    def run(self, *cmds):
        output = None
        for cmd in cmds:
            if self.sudo:
                cmd = 'sudo -n -- %s' % cmd
            if self.verbose:
                print('%s$ %s' % (self.hostname, cmd))
            if not self.dryrun:
                p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                output = (p.stderr.read() or p.stdout.read()).decode('unicode_escape')
                if self.verbose and output:
                    print(output)
                p.wait()
        return output

    def run_script(self, script):
        return self.run(*filter(None, script.split('\n')))

    def copy(self, local_path, remote_path):
        self.run('cp %s %s' % (local_path, remote_path))


class SSHClient:
    def __init__(self, hostname, verbose=False, dryrun=False, sudo=False):
        self.hostname = hostname
        self.verbose, self.dryrun, self.sudo = verbose, dryrun, sudo
        if dryrun:
            return
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

    def run(self, *cmds):
        output = None
        for cmd in cmds:
            if self.sudo:
                cmd = 'sudo -n -- %s' % cmd
            if self.verbose:
                print('%s$ %s' % (self.hostname, cmd))
            if not self.dryrun:
                lasti, lasto, laste = self.client.exec_command(cmd)
                if self.verbose:
                    output = (laste.read() or lasto.read()).decode('unicode_escape')
                    if output:
                        print(output)
        return output

    def run_script(self, script):
        return self.run(*filter(None, script.split('\n')))

    def copy(self, local_path, remote_path):
        if self.verbose:
            print('%s$ copying %s to %s' % (self.hostname, local_path, remote_path))
        if not self.dryrun:
            sftp = self.client.open_sftp()
            try:
                sftp.stat(remote_path)
            except:
                sftp.put(local_path, remote_path)
            sftp.close()


def spawn_cmd(cmd, out, err):
    return 'nohup %s > %s 2> %s < /dev/null &' % (cmd, out, err)
