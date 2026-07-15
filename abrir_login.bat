@echo off
echo ===================================================
echo 🔑 Abrindo Navegador para Login no Mercado Livre
echo ===================================================
echo.

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_PATH2=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

:: Determina o caminho completo da pasta .tmp\ml_user_data
set "USER_DATA_DIR=%~dp0.tmp\ml_user_data"

if exist "%CHROME_PATH%" (
    echo Abrindo Google Chrome...
    start "" "%CHROME_PATH%" --user-data-dir="%USER_DATA_DIR%" --disable-blink-features=AutomationControlled "https://www.mercadolivre.com.br/l/afiliados-home"
    goto end
)

if exist "%CHROME_PATH2%" (
    echo Abrindo Google Chrome (x86)...
    start "" "%CHROME_PATH2%" --user-data-dir="%USER_DATA_DIR%" --disable-blink-features=AutomationControlled "https://www.mercadolivre.com.br/l/afiliados-home"
    goto end
)

if exist "%EDGE_PATH%" (
    echo Abrindo Microsoft Edge...
    start "" "%EDGE_PATH%" --user-data-dir="%USER_DATA_DIR%" --disable-blink-features=AutomationControlled "https://www.mercadolivre.com.br/l/afiliados-home"
    goto end
)

echo ❌ Erro: Nao foi possivel encontrar o Chrome ou o Edge no computador.
pause

:end
exit
