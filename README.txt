Dependências:

1. NodeJS >= 0.10.32
2. Haproxy >= 1.4
3. AWS CLI

Instalando:

1. Criar um ROLE no IAM dando acesso para as máquinas ec2. A mínima permissão que precisa é:

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

2. Criar uma máquina UBUNTU, e liberar a porta 80 da maquina do odhom. Liberar o acesso da máquina do odhom em cada máquina que você deseja
que ele suba/derrube/seje proxy delas.
(não é necessário liberar as portas 80 das máquinas de homologação para 0.0.0.0, basta liberar apenas vindo da máquina onde o odhom está instalado.)


Instalar o que for necessário, além dos arquivos do ODHOM em /opt/odhom (caminho hardcoded em odhom.conf)

2.1. NodeJS >= 0.10.32
2.2. Haproxy >= 1.4
2.3. AWS CLI

Script com apt-get disponível em script-bringup.sh


3.Colocar o arquivo odhom.conf em /etc/init, para que o upstart gerencia corretamente.

4. Inicializando: sudo start odhom




Adicionando máquinas para que sejam gerenciadas pelo odhom:

1. Adicionar a tag odhom-host com o hostname completo (por exemplo tag-name odhom-host , tag:value hml.www.ibopeecommerce.com.br)

é possível usar mais de um valor na tag odhom-host, separando por vírgula, sem espaços entre eles: (ex: hml.www.ibopeecommerce.com.br,hml.ibopeecommerce.com.br);

2. Configurar o route53 para apontar esses hostnames (hml.www.ibopeecommerce.com.br) como CNAME para a máquina onde o ODHOM será instalado.

É possível verificar o status das máquinas acessando a url do servidor + /odhom (ex: odhom.ibopeecommerce.com.br/odhom)

Limitações:

1-) Apenas a região us-east é suportada (hardcoded)
2-) para que o route53 funcione corretamente, é necessário mudar o HOSTED-ZONE id em server.js, que está hardcoded pra ibopeecommerce.com.br