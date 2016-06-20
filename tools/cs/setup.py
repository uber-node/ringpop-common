#!/usr/bin/env python
from setuptools import setup
from setuptools import find_packages

setup(
    name='clustershaper',
    version='0.0.1',
    description="A set of tools for traffic shaping",
    author_email='sever@uber.com',
    zip_safe=False,
    packages=find_packages(),
    entry_points = {
        'console_scripts': [
            'vc=clustershaper.vc:main',
            'ns=clustershaper.ns:main'
        ],
    },
    install_requires=[
        'jinja2',
        'paramiko',
        'docopt',
        'pyyaml',
        'py2-ipaddress',
    ],
)
