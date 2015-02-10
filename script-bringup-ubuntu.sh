#!/bin/bash
apt-add-repository -y ppa:awstools-dev/awstools
apt-get -y update
apt-get -y install ec2-api-tools
apt-get -y install awscli
apt-get -y install haproxy
apt-get -y install node.js
echo America/Sao_Paulo >/etc/timezone
dpkg-reconfigure -f noninteractive tzdata
