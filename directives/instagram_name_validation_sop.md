# SOP - Validação e Ranking de Nomes de Usuário no Instagram (instagram_name_validation_sop.md)

Este procedimento operacional padrão descreve como validar a disponibilidade de um lote de nomes de usuário do Instagram de forma automatizada e classificar as opções disponíveis.

## Objetivos
1. Gerar e filtrar sugestões de nomes altamente memoráveis e relacionados ao nicho de promoções/achados (Mercado Livre e Shopee).
2. Verificar a disponibilidade de cada nome no Instagram de forma automatizada sem causar bloqueios de IP.
3. Rankear os nomes disponíveis por criatividade, legibilidade, tamanho e força de branding.

## Entrada
Uma lista de usernames potenciais no formato JSON ou hardcoded no script.

## Processo de Verificação (Puppeteer)
1. O script inicializa o `puppeteer-core` de forma headless.
2. Para cada nome na lista:
   - Define o User-Agent para simular um navegador desktop comum.
   - Navega para `https://www.instagram.com/<username>/`.
   - Aguarda 2 segundos para o carregamento do DOM.
   - Verifica a existência de elementos que indicam página indisponível:
     - Título da página ou elemento `h2` contendo "Esta página não está disponível" / "This page isn't available".
     - Se o elemento for encontrado, o nome é considerado **disponível**.
     - Se carregar dados do usuário (fotos, bio) ou não encontrar a mensagem de indisponibilidade, o nome é considerado **indisponível** (ou ocupado).
   - Insere um atraso aleatório entre 1,5 e 3 segundos antes do próximo nome para evitar rate limit.

## Algoritmo de Ranking (Score de 0 a 100)
Os nomes disponíveis serão pontuados com base nos seguintes critérios:
1. **Comprimento (Comprimento do nome)**:
   - Nomes mais curtos são mais fáceis de lembrar.
   - <= 12 caracteres: +30 pontos
   - 13 a 18 caracteres: +20 pontos
   - > 18 caracteres: +10 pontos
2. **Uso de Caracteres Especiais (`.` ou `_`)**:
   - Sem caracteres especiais ou apenas 1 ponto/underline: +20 pontos
   - Mais de 1 caractere especial: +10 pontos
   - Caracteres consecutivos (ex: `__` ou `..`): +0 pontos (desaconselhado)
3. **Força do Tema (Mercado Livre, Shopee, Achados, Ofertas)**:
   - Contém palavras fortes como `livre`, `radar`, `garimpo`, `achados`, `cupons`: +30 pontos
   - Outras palavras genéricas de promoção: +15 pontos
4. **Facilidade de Pronúncia (Criatividade/Sonoridade)**:
   - Avaliação subjetiva de branding (sonoridade limpa, fácil escrita): +20 pontos
   - Escrita complexa ou confusa: +5 pontos

## Saída
Um relatório final no chat com o ranking dos nomes disponíveis e sua pontuação de qualidade/criatividade.
