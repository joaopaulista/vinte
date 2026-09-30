-- VINTE — regras padrão de categorização
--
-- Cobre os estabelecimentos e termos mais comuns em extratos brasileiros.
-- Regenerável: apaga e recria as regras do sistema, sem tocar nas do usuário.
--
-- `priority` menor vence. 10 = nome de marca (específico), 50 = termo comum,
-- 70 = palavra genérica que pode dar falso positivo. O empate é desfeito pelo
-- padrão mais longo, então 'uber eats' ganha de 'uber' mesmo se empatassem.

delete from public.category_rules where user_id is null;

insert into public.category_rules (user_id, pattern, category_id, subcategory_id, priority)
select
  null,
  r.pattern,
  ('11111111-1111-4111-8111-0000000000' || r.cat)::uuid,
  case when r.sub is null then null
       else ('22222222-2222-4222-8222-0000000000' || r.sub)::uuid end,
  r.priority
from (values
  -- Alimentação ------------------------------------------------------------
  ('ifood',            '02', '0a', 10),
  ('rappi',            '02', '0a', 10),
  ('uber eats',        '02', '0a', 10),
  ('pao de acucar',    '02', '08', 10),
  ('carrefour',        '02', '08', 10),
  ('assai',            '02', '08', 10),
  ('atacadao',         '02', '08', 10),
  ('big bompreco',     '02', '08', 10),
  ('sendas',           '02', '08', 10),
  ('supermercado',     '02', '08', 50),
  ('hipermercado',     '02', '08', 50),
  ('mercearia',        '02', '08', 50),
  ('padaria',          '02', '0b', 50),
  ('confeitaria',      '02', '0b', 50),
  ('cafeteria',        '02', '0b', 50),
  ('starbucks',        '02', '0b', 10),
  ('restaurante',      '02', '09', 50),
  ('churrascaria',     '02', '09', 50),
  ('mcdonalds',        '02', '09', 10),
  ('burger king',      '02', '09', 10),
  ('outback',          '02', '09', 10),
  ('madero',           '02', '09', 10),
  ('subway',           '02', '09', 10),
  ('mercado',          '02', '08', 70),

  -- Transporte -------------------------------------------------------------
  ('uber',             '03', '0d', 50),
  ('cabify',           '03', '0d', 10),
  ('99 tecnologia',    '03', '0d', 10),
  ('99pop',            '03', '0d', 10),
  ('posto',            '03', '0c', 50),
  ('ipiranga',         '03', '0c', 10),
  ('petrobras',        '03', '0c', 10),
  ('shell select',     '03', '0c', 10),
  ('combustivel',      '03', '0c', 50),
  ('estacionamento',   '03', '0f', 50),
  ('estapar',          '03', '0f', 10),
  ('sem parar',        '03', '0f', 10),
  ('conectcar',        '03', '0f', 10),
  ('veloe',            '03', '0f', 10),
  ('pedagio',          '03', '0f', 50),
  ('bilhete unico',    '03', '0e', 10),
  ('metro',            '03', '0e', 70),

  -- Moradia ----------------------------------------------------------------
  ('aluguel',          '01', '01', 50),
  ('imobiliaria',      '01', '01', 50),
  ('condominio',       '01', '02', 50),
  ('enel',             '01', '03', 10),
  ('cemig',            '01', '03', 10),
  ('copel',            '01', '03', 10),
  ('cpfl',             '01', '03', 10),
  ('neoenergia',       '01', '03', 10),
  ('energia eletrica', '01', '03', 50),
  ('sabesp',           '01', '04', 10),
  ('copasa',           '01', '04', 10),
  ('cedae',            '01', '04', 10),
  ('comgas',           '01', '06', 10),
  ('vivo fibra',       '01', '05', 10),
  ('net claro',        '01', '05', 10),
  ('internet',         '01', '05', 50),

  -- Saúde ------------------------------------------------------------------
  ('unimed',           '04', '11', 10),
  ('amil',             '04', '11', 10),
  ('bradesco saude',   '04', '11', 10),
  ('sulamerica saude', '04', '11', 10),
  ('hapvida',          '04', '11', 10),
  ('drogasil',         '04', '12', 10),
  ('droga raia',       '04', '12', 10),
  ('pague menos',      '04', '12', 10),
  ('panvel',           '04', '12', 10),
  ('drogaria',         '04', '12', 50),
  ('farmacia',         '04', '12', 50),
  ('smart fit',        '04', '14', 10),
  ('bluefit',          '04', '14', 10),
  ('academia',         '04', '14', 50),
  ('laboratorio',      '04', '13', 50),
  ('clinica',          '04', '13', 50),
  ('hospital',         '04', '13', 50),

  -- Lazer ------------------------------------------------------------------
  ('netflix',          '06', '18', 10),
  ('spotify',          '06', '18', 10),
  ('disney plus',      '06', '18', 10),
  ('prime video',      '06', '18', 10),
  ('youtube premium',  '06', '18', 10),
  ('deezer',           '06', '18', 10),
  ('cinemark',         '06', '1b', 10),
  ('ingresso com',     '06', '1b', 10),
  ('cinema',           '06', '1b', 50),
  ('airbnb',           '06', '19', 10),
  ('booking',          '06', '19', 10),
  ('latam',            '06', '19', 10),
  ('gol linhas',       '06', '19', 10),
  ('azul linhas',      '06', '19', 10),
  ('decolar',          '06', '19', 10),
  ('ze delivery',      '06', '1a', 10),

  -- Compras ----------------------------------------------------------------
  ('mercado livre',    '07', '1d', 10),
  ('mercadolivre',     '07', '1d', 10),
  ('amazon',           '07', '1d', 10),
  ('magazine luiza',   '07', '1d', 10),
  ('americanas',       '07', '1d', 10),
  ('shopee',           '07', '1d', 10),
  ('aliexpress',       '07', '1d', 10),
  ('kabum',            '07', '1d', 10),
  ('renner',           '07', '1c', 10),
  ('riachuelo',        '07', '1c', 10),
  ('zara',             '07', '1c', 10),
  ('centauro',         '07', '1c', 10),
  ('netshoes',         '07', '1c', 10),
  ('leroy merlin',     '07', '1e', 10),
  ('telhanorte',       '07', '1e', 10),

  -- Serviços ---------------------------------------------------------------
  ('vivo',             '08', '21', 60),
  ('claro',            '08', '21', 60),
  ('google',           '08', '20', 50),
  ('apple com',        '08', '20', 10),
  ('microsoft',        '08', '20', 10),
  ('openai',           '08', '20', 10),
  ('chatgpt',          '08', '20', 10),
  ('adobe',            '08', '20', 10),

  -- Impostos e taxas -------------------------------------------------------
  ('tarifa',           '09', '24', 50),
  ('anuidade',         '09', '24', 50),
  ('cesta de servicos','09', '24', 50),
  ('pacote de servico','09', '24', 50),
  ('iof',              '09', '23', 50),
  ('darf',             '09', '23', 50),
  ('iptu',             '09', '23', 50),
  ('ipva',             '09', '23', 50),
  ('juros',            '09', '25', 50),
  ('multa',            '09', '25', 50),

  -- Receitas ---------------------------------------------------------------
  ('salario',          '0a', '26', 50),
  ('remuneracao',      '0a', '26', 50),
  ('reembolso',        '0a', '28', 50),

  -- Investimentos ----------------------------------------------------------
  ('tesouro direto',   '0b', '2a', 10),
  ('aplicacao',        '0b', '2a', 50),
  ('cdb',              '0b', '2a', 50),
  ('resgate',          '0b', '2b', 50),
  ('rendimento',       '0b', '2c', 50),
  ('dividendo',        '0b', '2c', 50),

  -- Transferências ---------------------------------------------------------
  ('pix enviado',      '0c', '2e', 40),
  ('pix recebido',     '0c', '2f', 40),
  ('ted enviada',      '0c', '2d', 40),
  ('transferencia',    '0c', '2d', 60)
) as r(pattern, cat, sub, priority);
