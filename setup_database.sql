-- SQL Script para configurar o banco de dados do MyCarFleet SaaS no Supabase
-- COPIE E COLE NO SQL EDITOR DO SUPABASE

-- 1. EXTENSÕES E LIMPEZA (OPCIONAL)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE PERFIS (Extensão do Auth.Users)
-- Cada usuário autenticado terá uma entrada aqui para identificar sua oficina
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  workshop_name TEXT NOT NULL,
  owner_name TEXT,
  cnpj TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TABELA DE CLIENTES
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf_cnpj TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABELA DE VEÍCULOS
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  license_plate TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  vin TEXT, -- Chassi
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABELA DE ESTOQUE (PEÇAS/PRODUTOS)
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 1,
  purchase_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABELA DE ORDENS DE SERVIÇO
CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  status TEXT DEFAULT 'Open', -- Open, In Progress, Completed, Cancelled
  total_amount DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  labor_services JSONB DEFAULT '[]', -- Armazena a lista de serviços e quantidades
  mileage INTEGER,
  entry_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  exit_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TABELA DE AGENDAMENTOS
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  vehicle_brand_model TEXT, -- Para casos onde o veículo ainda não está cadastrado
  service_type TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status TEXT DEFAULT 'Pendente', -- Pendente, Confirmado, Cancelado, Finalizado
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TABELA FINANCEIRA (LANÇAMENTOS)
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  service_order_id UUID REFERENCES service_orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- Receita, Despesa
  category TEXT,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT,
  due_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'Pago', -- Pago, Pendente
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- ATIVAR SEGURANÇA (RLS) - Nível de Oficina
-- ==========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: O usuário só pode ver/editar dados onde o workshop_id ou id seja o dele.

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own profile') THEN
        CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile') THEN
        CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own profile') THEN
        CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access customers') THEN
        CREATE POLICY "Workshop access customers" ON customers FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access vehicles') THEN
        CREATE POLICY "Workshop access vehicles" ON vehicles FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access inventory') THEN
        CREATE POLICY "Workshop access inventory" ON inventory FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access service_orders') THEN
        CREATE POLICY "Workshop access service_orders" ON service_orders FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access appointments') THEN
        CREATE POLICY "Workshop access appointments" ON appointments FOR ALL USING (workshop_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workshop access transactions') THEN
        CREATE POLICY "Workshop access transactions" ON financial_transactions FOR ALL USING (workshop_id = auth.uid());
    END IF;
END $$;

-- Triggers Automáticos para Perfis
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, workshop_name)
  VALUES (new.id, 'Minha Oficina');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
