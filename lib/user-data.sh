#!/bin/bash
sudo su
yum update -y

# Install Apache
yum install -y httpd
systemctl start httpd
systemctl enable httpd

# Install PHP 8.1 and necessary extensions
amazon-linux-extras enable php8.1
yum clean metadata
yum install -y php php-{common,cli,mbstring,xml,gd,zip,pdo,mysqlnd}

# Install Composer
export HOME=/root
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
chmod +x /usr/local/bin/composer
# Create Laravel project
cd /var/www
/usr/local/bin/composer create-project --prefer-dist laravel/laravel laravel-project "9.*"
chown -R apache:apache /var/www/laravel-project

# Configure Apache to serve Laravel project
cat > /etc/httpd/conf.d/laravel.conf <<EOL
<VirtualHost *:80>
    DocumentRoot /var/www/laravel-project/public
    <Directory /var/www/laravel-project/public>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
EOL

# Restart Apache to load new configurations
systemctl restart httpd