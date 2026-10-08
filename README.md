# Cozinha Lucca & Izis

App pessoal de receitas, cardápio da semana e lista de mercado, feito para dois celulares.

- **Abrir:** https://samuhaya.github.io/cozinha/
- **Instalar:** no iPhone (Safari), toque em Compartilhar e depois em "Adicionar à Tela de Início". No Android (Chrome), toque em ⋮ e depois em "Adicionar à tela inicial".
- **Sincronizar:** no topo do app, toque em "Conectar a casa" e depois em "Criar código da casa". Em seguida, mande o convite para a outra pessoa pelo WhatsApp.

## Como funciona
- Um único `index.html`, sem build. Os dados ficam no celular (localStorage) e, com o código da casa, também no Firebase Firestore (`casas/<código>/...`).
- O `sw.js` guarda o app para abrir sem internet.
- `firestore.rules` são as regras do banco, coladas no console do Firebase.

## Testes
```
npm i -D playwright
node tests/smoke.cjs                    # app inteiro no tamanho de celular
BACKEND=firebase node tests/sync.cjs    # dois celulares sincronizando (Firebase simulado)
```
