Depend�ncias:

1. NodeJS >= 0.10.32
2. Haproxy >= 1.4
3. AWS CLI

Instalando:

1. Criar um ROLE no IAM dando acesso para as m�quinas ec2. A m�nima permiss�o que precisa �:

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

2. Criar uma m�quina UBUNTU, e liberar a porta 80 da maquina do odhom. Liberar o acesso da m�quina do odhom em cada m�quina que voc� deseja
que ele suba/derrube/seje proxy delas.
(n�o � necess�rio liberar as portas 80 das m�quinas de homologa��o para 0.0.0.0, basta liberar apenas vindo da m�quina onde o odhom est� instalado.)


Instalar o que for necess�rio, al�m dos arquivos do ODHOM em /opt/odhom (caminho hardcoded em odhom.conf)

2.1. NodeJS >= 0.10.32
2.2. Haproxy >= 1.4
2.3. AWS CLI

Script com apt-get dispon�vel em script-bringup.sh


3.Colocar o arquivo odhom.conf em /etc/init, para que o upstart gerencia corretamente.

4. Inicializando: sudo start odhom




Adicionando m�quinas para que sejam gerenciadas pelo odhom:

1. Adicionar a tag odhom-host com o hostname completo (por exemplo tag-name odhom-host , tag:value hml.www.ibopeecommerce.com.br)

� poss�vel usar mais de um valor na tag odhom-host, separando por v�rgula, sem espa�os entre eles: (ex: hml.www.ibopeecommerce.com.br,hml.ibopeecommerce.com.br);

2. Configurar o route53 para apontar esses hostnames (hml.www.ibopeecommerce.com.br) como CNAME para a m�quina onde o ODHOM ser� instalado.

� poss�vel verificar o status das m�quinas acessando a url do servidor + /odhom (ex: odhom.ibopeecommerce.com.br/odhom)

Limita��es:

1-) Apenas a regi�o us-east � suportada (hardcoded)
2-) para que o route53 funcione corretamente, � necess�rio mudar o HOSTED-ZONE id em server.js, que est� hardcoded pra ibopeecommerce.com.br