/**
 * execution/category_helper.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Módulo Utilitário Determinístico)
 *
 * Centraliza a taxonomia de categorias, subcategorias, emojis e 
 * regras de inferência por palavras-chave para o Mercado Livre e Amazon.
 */

const TAXONOMY = {
  'Eletrônicos e Tecnologia': {
    icon: '💻',
    subcategories: {
      'Celulares e Smartphones': ['smartphone', 'celular', 'iphone', 'motorola', 'samsung', 'xiaomi', 'redmi', 'telef', 'poco'],
      'Computadores e Notebooks': ['notebook', 'laptop', 'computador', 'pc gamer', 'macbook', 'ipad', 'tablet', 'monitor', 'impressora'],
      'Fones de Ouvido e Som': ['fone', 'headset', 'caixa de som', 'alexa', 'jbl', 'bluetooth', 'earbuds', 'headphone', 'soundbar'],
      'Smartwatches e Relógios': ['smartwatch', 'relogio', 'watch', 'mi band', 'pulseira inteligente'],
      'Acessórios e Periféricos': ['teclado', 'mouse', 'cabo', 'carregador', 'pendrive', 'hd externo', 'ssd', 'roteador', 'filtro de linha', 'webcam']
    }
  },
  'Casa, Cozinha e Eletrodomésticos': {
    icon: '🏠',
    subcategories: {
      'Eletrodomésticos Grandes': ['geladeira', 'fogao', 'lavadora', 'lava e seca', 'secadora', 'microondas', 'ar condicionado', 'ventilador', 'aspirador', 'climatizador', 'freezer'],
      'Eletroportáteis': ['airfryer', 'fritadeira', 'cafeteira', 'liquidificador', 'batedeira', 'sanduicheira', 'grill', 'chapa', 'espremedor', 'mixer', 'panela eletrica', 'chaleira eletrica'],
      'Utensílios de Cozinha': ['panela', 'frigideira', 'faca', 'garfo', 'colher', 'copo', 'prato', 'chaleira', 'assadeira', 'pote', 'tábua', 'escorredor', 'abridor'],
      'Cama, Mesa, Banho e Decoração': ['lençol', 'toalha', 'travesseiro', 'almofada', 'cortina', 'tapete', 'luminaria', 'quadro', 'espelho', 'organizador', 'manta', 'cobertor']
    }
  },
  'Futebol e Mantos Esportivos': {
    icon: '⚽',
    subcategories: {
      'Clubes Nacionais 🇧🇷': ['flamengo', 'palmeiras', 'corinthians', 'sao paulo', 'são paulo', 'vasco', 'gremio', 'grêmio', 'internacional', 'atletico', 'atlético', 'cruzeiro', 'botafogo', 'fluminense', 'santos', 'bahia', 'sport', 'vitoria', 'vitória', 'fortaleza', 'ceara', 'ceará', 'juventude', 'bragantino', 'chapecoense', 'criciuma', 'criciúma', 'ousadia fc', 'junpe', 'goianiense', 'coritiba', 'operario', 'operário', 'vila nova', 'figueirense', 'ponte preta', 'guarani', 'avai', 'avaí', 'paysandu', 'remo'],
      'Clubes Internacionais 🌍': ['real madrid', 'barcelona', 'bayern', 'psg', 'juventus', 'manchester', 'liverpool', 'chelsea', 'arsenal', 'milan', 'inter de milao', 'inter de milão', 'benfica', 'porto', 'sporting', 'borussia', 'dortmund', 'roma', 'napoli', 'ajax', 'boca juniors', 'river plate', 'al-nassr', 'al nassr', 'inter miami'],
      'Seleções Nacionais 🏆': ['selecao', 'seleção', 'brasil', 'argentina', 'alemanha', 'franca', 'frança', 'italia', 'itália', 'espanha', 'portugal', 'inglaterra', 'uruguai', 'holanda', 'japao', 'japão', 'colombia', 'colômbia'],
      'Chuteiras e Futsal 👟': ['chuteira', 'society', 'futsal', 'campo', 'indoor', 'fut-5', 'trava'],
      'Basquete e NBA 🏀': ['nba', 'lakers', 'bulls', 'celtics', 'warriors', 'nets', 'jordan', 'basquete', 'regata nba'],
      'Vestuário e Agasalhos 👕': ['agasalho', 'jaqueta', 'moletom', 'calca', 'calça', 'bermuda', 'shorts', 'regata', 'polos', 'polo', 'cropped', 'puffer', 'manga longa', 'jaqueta esportiva', 'colete'],
      'Equipamentos e Acessórios 🎒': ['luva de goleiro', 'bola de futebol', 'bola', 'caneleira', 'meiao', 'meião', 'mochila', 'bolsa', 'bone', 'boné', 'faixa de capitao']
    }
  },
  'Saúde, Fitness e Esportes': {
    icon: '💪',
    subcategories: {
      'Camisas de Futebol e Mantos': ['camisa', 'manto', 'oficial', 'futfanatics', 'reforma', 'retro'],
      'Chuteiras e Equipamentos de Futebol': ['chuteira', 'society', 'futsal', 'campo', 'luva de goleiro', 'bola de futebol', 'caneleira futebol', 'meia de futebol'],
      'Suplementos e Creatinas': ['creatina', 'whey', 'proteina', 'suplemento', 'caps', 'omega', 'vitamina', 'colageno', 'termogenico', 'pre treino', 'bcaa', 'glutamina'],
      'Roupas e Calçados Esportivos': ['camisa dry fit', 'shorts academia', 'legging', 'tenis corrida', 'meia esportiva', 'top fitness', 'agasalho', 'jaqueta esportiva', 'regata'],
      'Equipamentos de Treino': ['halter', 'colchonete', 'elastico', 'caneleira', 'barra', 'esteira', 'bicicleta ergometrica', 'corda de pular', 'anilhas'],
      'Bike e Lazer': ['bicicleta', 'bike', 'capacete', 'patinete', 'skate', 'mochila hidratação', 'barraca', 'saco de dormir']
    }
  },
  'Beleza e Cuidados Pessoais': {
    icon: '✨',
    subcategories: {
      'Perfumaria': ['perfume', 'fragrancia', 'colonia', 'body splash', 'eau de parfum'],
      'Cuidados com Cabelo': ['shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'secador', 'chapinha', 'modelador', 'maquina de cortar cabelo', 'barbeador'],
      'Skincare e Maquiagem': ['protetor solar', 'hidratante facial', 'sabonete liquido', 'base', 'batom', 'rimel', 'delineador', 'serum', 'anti-idade', 'paleta de sombras'],
      'Higiene Diária': ['desodorante', 'sabonete', 'creme dental', 'escova de dentes', 'fio dental', 'aparelho de barbear', 'absorvente', 'enxaguante']
    }
  },
  'Moda e Acessórios': {
    icon: '👗',
    subcategories: {
      'Calçados': ['tenis', 'sapato', 'sandalia', 'chinelo', 'bota', 'sapatilha', 'crocs', 'rasteirinha'],
      'Roupas Masculinas': ['camiseta masculina', 'camisa polo', 'calça jeans masculina', 'bermuda', 'cueca', 'casaco masculino', 'jaqueta'],
      'Roupas Femininas': ['vestido', 'blusa', 'calça jeans feminina', 'saia', 'lingerie', 'body', 'biquini', 'casaco feminino'],
      'Bolsas e Mochilas': ['mochila', 'bolsa', 'carteira', 'mala de viagem', 'necessaire', 'pochete']
    }
  },
  'Games e Consoles': {
    icon: '🎮',
    subcategories: {
      'Consoles': ['playstation', 'ps5', 'nintendo switch', 'xbox', 'console', 'ps4'],
      'Jogos': ['game', 'jogo', 'midia fisica', 'zelda', 'mario', 'fifa', 'gta', 'resident evil', 'elden ring'],
      'Acessórios Gamer': ['controle ps5', 'dualshock', 'headset gamer', 'cadeira gamer', 'mouse gamer', 'teclado mecanico', 'joycon', 'mousepad gamer']
    }
  },
  'Bebidas e Alimentos': {
    icon: '🍻',
    subcategories: {
      'Destilados e Cervejas': ['whisky', 'whiskey', 'gin', 'vodka', 'cerveja', 'chope', 'rum', 'licor', 'tequila', 'cachaça'],
      'Vinhos e Espumantes': ['vinho', 'espumante', 'champagne', 'cabernet', 'malbec', 'chardonnay', 'merlot'],
      'Alimentos e Cafés': ['cafe em grao', 'capsula cafe', 'chocolate', 'snack', 'azeite', 'doce', 'barra de cereal', 'biscoito', 'macarrão']
    }
  },
  'Ferramentas e Construção': {
    icon: '🛠️',
    subcategories: {
      'Ferramentas Elétricas': ['parafusadeira', 'furadeira', 'serra', 'esmerilhadeira', 'lixadeira', 'soprador'],
      'Ferramentas Manuais': ['chave de fenda', 'alicate', 'martelo', 'trena', 'maleta de ferramentas', 'nivel bolha'],
      'Jardim e Reparos': ['mangueira', 'lavadora de alta pressao', 'fita isolante', 'cola', 'lampada led', 'refletor', 'organizador de ferramentas']
    }
  }
};

const RECURRING_PURCHASE_GROUPS = {
  'Higiene e cuidados pessoais': [
    'shampoo', 'condicionador', 'sabonete', 'desodorante', 'creme dental',
    'pasta de dente', 'escova de dentes', 'fio dental', 'enxaguante bucal',
    'absorvente', 'papel higienico', 'fralda', 'lenco umedecido'
  ],
  'Limpeza da casa': [
    'detergente', 'sabao em po', 'lava roupas', 'amaciante', 'desinfetante',
    'agua sanitaria', 'limpador', 'esponja', 'saco de lixo'
  ],
  'Alimentos e bebidas': [
    'cafe em grao', 'cafe moido', 'capsula de cafe', 'arroz', 'feijao',
    'macarrao', 'azeite', 'leite em po', 'biscoito', 'chocolate'
  ],
  'Saude e suplementos': [
    'creatina', 'whey', 'proteina', 'vitamina', 'omega 3', 'colageno',
    'suplemento', 'pre treino'
  ],
  'Cuidados com pets': [
    'racao', 'areia higienica', 'tapete higienico', 'petisco'
  ]
};

function normalizeProductText(value) {
  return ` ${String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

function getRecurringPurchaseCategory(title) {
  const normalized = normalizeProductText(title);
  for (const [group, keywords] of Object.entries(RECURRING_PURCHASE_GROUPS)) {
    if (keywords.some(keyword =>
      normalized.includes(normalizeProductText(keyword))
    )) return group;
  }
  return null;
}

function mixRecurringDeals(
  regularDeals,
  recurringDeals,
  maxProducts,
  maxRecurringProducts
) {
  const recurringLimit = Math.min(
    maxProducts,
    maxRecurringProducts,
    recurringDeals.length
  );
  const regularLimit = Math.min(
    regularDeals.length,
    maxProducts - recurringLimit
  );
  const regular = regularDeals.slice(0, regularLimit);
  const recurring = recurringDeals.slice(0, recurringLimit);
  const mixed = [];
  let regularIndex = 0;
  let recurringIndex = 0;
  while (
    mixed.length < maxProducts &&
    (regularIndex < regular.length || recurringIndex < recurring.length)
  ) {
    for (
      let count = 0;
      count < 3 &&
      regularIndex < regular.length &&
      mixed.length < maxProducts;
      count += 1
    ) {
      mixed.push(regular[regularIndex]);
      regularIndex += 1;
    }
    if (
      recurringIndex < recurring.length &&
      mixed.length < maxProducts
    ) {
      mixed.push(recurring[recurringIndex]);
      recurringIndex += 1;
    }
  }
  return mixed;
}

/**
 * Infere a categoria e subcategoria a partir do título do produto.
 * @param {string} title Título do produto
 * @returns {object} { category, subcategory, icon }
 */
function inferCategoryAndSub(title) {
  if (!title) {
    return {
      category: 'Ofertas Gerais',
      subcategory: 'Outros',
      icon: '🛍️'
    };
  }

  const cleanTitle = title.toLowerCase();

  // Varre a taxonomia buscando a palavra-chave no título
  for (const [catName, catData] of Object.entries(TAXONOMY)) {
    for (const [subName, keywords] of Object.entries(catData.subcategories)) {
      for (const keyword of keywords) {
        if (cleanTitle.includes(keyword)) {
          // Exceções e refinamentos específicos para termos ambíguos:
          if (keyword === 'cola' && cleanTitle.includes('colageno')) continue; // colágeno é suplemento
          if (keyword === 'cabo' && cleanTitle.includes('cabernet')) continue; // Cabernet é vinho
          if (keyword === 'barra' && cleanTitle.includes('barra de cereal')) continue; // barra de cereal é alimentos
          if (keyword === 'game' && cleanTitle.includes('cadeira gamer')) continue; // cadeira gamer é acessório gamer
          
          return {
            category: catName,
            subcategory: subName,
            icon: catData.icon
          };
        }
      }
    }
  }

  // Fallback se não bater com nenhuma regra
  return {
    category: 'Ofertas Gerais',
    subcategory: 'Outros',
    icon: '🛍️'
  };
}

module.exports = {
  TAXONOMY,
  inferCategoryAndSub,
  getRecurringPurchaseCategory,
  mixRecurringDeals
};
