FROM nginx:alpine

# Copiar os arquivos estáticos para a pasta padrão do Nginx
COPY ./ /usr/share/nginx/html/

# Expor a porta 80
EXPOSE 80

# Comando padrão do Nginx
CMD ["nginx", "-g", "daemon off;"]
