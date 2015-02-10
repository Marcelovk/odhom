# odhom
Proxy that starts/shutdown AWS instances on demand using HTTP headers

Depends on 

1. NodeJS >= 0.10.32
2. Haproxy >= 1.4
3. AWS CLI
4. Ubuntu with upstart (can be run on other distros too)

Installing

1. Create a ROLE or an USER on AWS IAM giving access to start/stop EC2 instances for instances with the odhom-host tag. The minimum JSON permissions are:

````

{
    "Version": "2012-10-17",
    "Statement": [
         {
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances" 
            ],
            "Resource": [
                "*" 
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "ec2:StartInstances",
                "ec2:StopInstances" 
            ],
            "Condition": {
                "StringLike": {
                    "ec2:ResourceTag/odhom-host": "*" 
                }
            },
            "Resource": [
                "*" 
            ]
        },
	{
            "Effect": "Allow",
            "Action": [
                "route53:*",
            ],
            "Resource": [
                "*" 
            ]
        }
    ]
}
````

1.1 If you are using an USER instead of an instance role, you must update the credentials (./credentials) file with the correct keys.

2. Create an UBUNTU instance on AWS console, and remember to open the port 80 TCP. For every instance that you want odhom to manage, you must open the access from the odhom instance to the port that is listening, so that odhom will be able to proxy it.

3. SSH into your newly created instance and run script-bringup-ubuntu.sh to install the dependencies and odhom on /opt/odhom.

4. Starting and stoping : 

sudo start odhom 
sudo stop odhom

5. Adding machines to odhom

5.1 Add the tag with the key=odhom-host and the value with the fully qualyfied hostname to every instance that you want. Be aware that as soon as odhom detects it (it scans every 5 seconds) it will shut down the machine after 55 minutes of inactivity (Activity is equal to receiving a HTTP request to that hostname)

You can add multiple hostnames on the odhom-host value, splitting using a comma and no spaces, example: domain1.yourcompany.com,www.domain1.yourcompany.com

5.2 Configure your DNS settings so that these domains point to the ip address (or to the CNAME record) of the odhom machine. You can also use your hosts file for testing on your machine, if you prefer.

5.3 There is a log file under /opt/odhom/odhom.log

You can check if odhom is running accessing its ip address and adding a /odhom after it.

Verify that works by trying to access a hostname that is managed by odhom, and viewing it on your ec2 control panel. The instance should be changing the state from stopped to running. The browser holds the access until it detects that the instance is up and listening to port 80, and then it issues a 302 pointing to the same address to refresh it. On the second refresh, the proxy will send it to the correct destination.
