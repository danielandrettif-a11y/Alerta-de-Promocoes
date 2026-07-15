@echo off
title 🔑 Conectando o Robo ao WhatsApp
echo ===================================================
echo 🔑 Conectando o Robo ao seu WhatsApp
echo ===================================================
echo.
echo 1. Um QR Code sera gerado abaixo.
echo 2. Abra o WhatsApp no seu celular.
echo 3. Va em "Aparelhos Conectados" -> "Conectar um Aparelho".
echo 4. Escaneie o QR Code na tela.
echo.
echo Pressione qualquer tecla para gerar o QR Code...
pause > nul
echo.
echo [📡] Carregando cliente do WhatsApp Web...
node execution/whatsapp_client.js --test "Alerta de Descontos"
echo.
echo ===================================================
echo Processo finalizado ou interrompido.
echo Pressione qualquer tecla para fechar esta janela...
pause > nul
