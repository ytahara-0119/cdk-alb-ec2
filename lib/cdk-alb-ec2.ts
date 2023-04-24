import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2_tg from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import {readFileSync} from 'fs';

interface CdkAlbEc2StackProps extends cdk.StackProps {
  envName: string;
  vpcCidr: string;
}
export class CdkAlbEc2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkAlbEc2StackProps) {
    super(scope, id, props);

    const { envName, vpcCidr } = props;
    // VPC作成
    const vpc = new ec2.Vpc(this, `${envName}-vpc`, {
      cidr: vpcCidr,
      maxAzs: 2,
      natGateways: 0,
    });
    cdk.Tags.of(vpc).add('Name', `${envName}-vpc`);


    // セキュリティグループ作成
    const securityGroup = new ec2.SecurityGroup(this, `${envName}-sg`, {
      vpc: vpc,
      allowAllOutbound: true,
    });
    // sshを許可するIPを入れる
    securityGroup.addIngressRule(ec2.Peer.ipv4('**targetIp/32'), ec2.Port.tcp(22));
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    cdk.Tags.of(securityGroup).add('Name', `${envName}-sg`);

    // プライベートサブネット作成
    const privateSubnet = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    });
    // EC2インスタンス作成
    const webserver = new ec2.Instance(this, `${envName}-ec2`, {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      securityGroup: securityGroup,
      vpcSubnets: privateSubnet,
    });

    // EC2起動時に実行するシェル
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
    webserver.addUserData(userDataScript);

    // EC2のキーペアを設定する。
    webserver.instance.addPropertyOverride('KeyName', '**KeypairName');
    cdk.Tags.of(webserver).add('Name', `${envName}-ec2`);

    // ElasticIPを取得
    const elasticIP = new ec2.CfnEIP(this, `${envName}-eip`, {
      instanceId: webserver.instanceId,
    });

    // ELBのセキュリティグループを作成
    const elbSecurityGroup = new ec2.SecurityGroup(this, `${envName}-elb-sg`, {
      vpc: vpc,
      allowAllOutbound: true,
    });
    cdk.Tags.of(elbSecurityGroup).add('Name', `${envName}-elb-sg`);
    // 80番ポートへのアウトバウンドを許可する
    elbSecurityGroup.addIngressRule(securityGroup, ec2.Port.tcp(80));
    // パブリックサブネット作成
    const publicSubnet = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    });
    // ELBを作成
    const elb = new elbv2.ApplicationLoadBalancer(this, `${envName}-elb`, {
      vpc: vpc,
      vpcSubnets: publicSubnet,
      internetFacing: true,
      securityGroup: elbSecurityGroup,
    });
    cdk.Tags.of(elb).add('Name', `${envName}-elb`);

    const instanceTarget = new elbv2_tg.InstanceTarget(webserver)
    // ELBターゲットグループ作成
    const targetGroup = new elbv2.ApplicationTargetGroup(this, `${envName}-tg`, {
      vpc: vpc,
      targetType: elbv2.TargetType.INSTANCE,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/', // ヘルスチェックのパスを変更します
        interval: cdk.Duration.seconds(30), // ヘルスチェックのインターバルを変更します
        timeout: cdk.Duration.seconds(5), // タイムアウト値を設定します（オプション）
      },
    });
    
    // ELBリスナーを設定
    const albListener = elb.addListener("AlbHttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP
    })
    
    albListener.addTargets("WebServerTarget", {
      targets: [ instanceTarget ],
      port: 80
    })

  }
}