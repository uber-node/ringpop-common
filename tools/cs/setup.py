#!/usr/bin/env python
from setuptools import setup
from setuptools import find_packages

setup(
    name='virtualcluster',
    version='0.0.1',
    description="A set of tools for traffic shaping",
    author_email='sever@uber.com',
    zip_safe=False,
    packages=find_packages(),
    entry_points = {
        'console_scripts': [
            'vc=virtualcluster.vc:main',
            'ns=virtualcluster.ns:main'
        ],
    },
    install_requires=[
        'jinja2',
        'paramiko',
        'docopt',
        'pyyaml',
    ],
    extras_require={
        ':python_version == "2.7"': ['py2-ipaddress'],
    }

)
