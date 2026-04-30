-- ==========================================
-- SCRIPT DE CORREÇÃO: TABELAS MISSING
-- Execute este script no SQL Editor do seu Supabase
-- ==========================================

-- 1. Tabelas Auxiliares do Estoque
CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Movimentações de Estoque
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES inventory(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- 'Entrada' ou 'Saída'
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC DEFAULT 0,
  unit_sale NUMERIC DEFAULT 0,
  batch_id TEXT, -- Agrupador de movimentação
  invoice_number TEXT,
  supplier TEXT,
  service_order_id UUID REFERENCES service_orders(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Funcionários / Mecânicos
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Mecânico',
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Fornecedores
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  document TEXT, -- CNPJ / CPF
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS e Criar Políticas
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Categorias
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access categories') THEN
        CREATE POLICY "Workshop access categories" ON inventory_categories FOR ALL USING (workshop_id = auth.uid());
    END IF;
    -- Unidades
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access units') THEN
        CREATE POLICY "Workshop access units" ON inventory_units FOR ALL USING (workshop_id = auth.uid());
    END IF;
    -- Modelos
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access vehicle_models') THEN
        CREATE POLICY "Workshop access vehicle_models" ON vehicle_models FOR ALL USING (workshop_id = auth.uid());
    END IF;
    -- Movimentações
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access movements') THEN
        CREATE POLICY "Workshop access movements" ON inventory_movements FOR ALL USING (workshop_id = auth.uid());
    END IF;
    -- Staff
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access staff') THEN
        CREATE POLICY "Workshop access staff" ON staff FOR ALL USING (workshop_id = auth.uid());
    END IF;
    -- Fornecedores
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access suppliers') THEN
        CREATE POLICY "Workshop access suppliers" ON suppliers FOR ALL USING (workshop_id = auth.uid());
    END IF;
END $$;

-- 4. Tabela de Histórico de Ordens de Serviço
CREATE TABLE IF NOT EXISTS service_order_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  service_order_id UUID REFERENCES service_orders(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- 'Status', 'Item', 'Manual', etc.
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- ATIVAR RLS E POLÍTICAS
-- ==========================================

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_history ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (Apenas dados da própria oficina)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access categories') THEN
        CREATE POLICY "Workshop access categories" ON inventory_categories FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access units') THEN
        CREATE POLICY "Workshop access units" ON inventory_units FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access vehicle_models') THEN
        CREATE POLICY "Workshop access vehicle_models" ON vehicle_models FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access movements') THEN
        CREATE POLICY "Workshop access movements" ON inventory_movements FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access staff') THEN
        CREATE POLICY "Workshop access staff" ON staff FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access history') THEN
        CREATE POLICY "Workshop access history" ON service_order_history FOR ALL USING (workshop_id = auth.uid());
    END IF;
END $$;
