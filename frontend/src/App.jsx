import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  LayoutDashboard,
  Settings as SettingsIcon,
  LogOut,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Trash2,
  Building2,
  RefreshCw,
  X,
  Eye,
  ArrowUpRight,
  Minus,
  UserCheck
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const TOKEN_KEY = 'stockflow_jwt_token';

// ============================================================================
// MAIN APPLICATION
// ============================================================================
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');

  // Backend Data State
  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState({
    total_products: 0,
    total_quantity_on_hand: 0,
    total_inventory_value: 0,
    low_stock_items: []
  });
  const [orgSettings, setOrgSettings] = useState({
    default_low_stock_threshold: 5
  });
  const [isLoading, setIsLoading] = useState(false);

  // Navigation: 'dashboard' | 'products' | 'settings'
  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'signup'
  const [triggerCreateModal, setTriggerCreateModal] = useState(0);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Sync Token
  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  // Authenticated Fetch Helper
  const apiFetch = useCallback(
    async (endpoint, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });

      const contentType = res.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => null);
      }
      return { ok: res.ok, status: res.status, data };
    },
    [token]
  );

  // Refresh All Data from Backend
  const refreshAllData = useCallback(async () => {
    if (!token) {
      setCurrentUser(null);
      return;
    }
    setIsLoading(true);
    try {
      // 1. Current user
      const meRes = await apiFetch('/auth/me');
      if (!meRes.ok) {
        setToken('');
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }
      setCurrentUser({
        ...meRes.data,
        organization: {
          id: meRes.data.org_id,
          name: meRes.data.organization_name
        }
      });

      // 2. Settings
      const setRes = await apiFetch('/settings');
      if (setRes.ok && setRes.data) {
        setOrgSettings(setRes.data);
      }

      // 3. Products
      const prodRes = await apiFetch('/products');
      if (prodRes.ok && Array.isArray(prodRes.data)) {
        const mapped = prodRes.data.map((p) => ({
          ...p,
          id: p.product_id,
          effective_threshold: p.low_stock_threshold,
          uses_global_threshold:
            p.low_stock_threshold === setRes?.data?.default_low_stock_threshold
        }));
        setProducts(mapped);
      }

      // 4. Dashboard Summary
      const dashRes = await apiFetch('/dashboard/summary');
      if (dashRes.ok && dashRes.data) {
        const totalVal = (prodRes.data || []).reduce(
          (sum, p) =>
            sum + Number(p.quantity_on_hand || 0) * Number(p.selling_price || 0),
          0
        );
        setDashboardSummary({
          total_products: dashRes.data.total_products,
          total_quantity_on_hand: dashRes.data.total_quantity,
          total_inventory_value: totalVal,
          low_stock_items: (dashRes.data.low_stock_items || []).map((p) => ({
            ...p,
            id: p.product_id,
            effective_threshold: p.low_stock_threshold
          }))
        });
      }
    } catch (err) {
      showToast(`Cannot reach backend: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [token, apiFetch, showToast]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  // Auth: Signup
  const handleSignup = async ({ email, password, confirmPassword, organizationName }) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanOrg = (organizationName || '').trim();

    if (!cleanEmail || !password || !cleanOrg) {
      return { ok: false, error: 'Email, Password, and Organization Name are required.' };
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return { ok: false, error: 'Passwords do not match.' };
    }

    try {
      const signupRes = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          organization_name: cleanOrg
        })
      });
      const signupData = await signupRes.json().catch(() => ({}));
      if (!signupRes.ok) {
        return { ok: false, error: signupData.detail || 'Signup failed' };
      }

      // Auto login
      const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) {
        return { ok: false, error: 'Account created, please sign in.' };
      }

      setToken(loginData.access_token);
      setActiveScreen('dashboard');
      showToast(`Organization "${cleanOrg}" created successfully!`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Connection failed: ${err.message}` };
    }
  };

  // Auth: Login
  const handleLogin = async ({ email, password }) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.detail || 'Invalid email or password.' };
      }

      setToken(data.access_token);
      setActiveScreen('dashboard');
      showToast('Signed in successfully.');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Cannot reach backend: ${err.message}` };
    }
  };

  // Auth: Logout
  const handleLogout = () => {
    setToken('');
    setCurrentUser(null);
    setProducts([]);
    setAuthTab('login');
    showToast('Signed out.', 'info');
  };

  // Products: Create
  const handleCreateProduct = async (formData) => {
    const payload = {
      name: (formData.name || '').trim(),
      sku: (formData.sku || '').trim().toUpperCase(),
      description: formData.description?.trim() || null,
      quantity_on_hand: Math.max(0, parseInt(formData.quantity_on_hand, 10) || 0),
      cost_price:
        formData.cost_price !== '' && formData.cost_price !== null
          ? parseFloat(formData.cost_price)
          : 0,
      selling_price:
        formData.selling_price !== '' && formData.selling_price !== null
          ? parseFloat(formData.selling_price)
          : 0,
      low_stock_threshold:
        formData.low_stock_threshold !== '' && formData.low_stock_threshold !== null
          ? parseInt(formData.low_stock_threshold, 10)
          : null
    };

    const res = await apiFetch('/products', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return { ok: false, error: res.data?.detail || 'Failed to create product' };
    }

    showToast(`Added "${payload.name}" to inventory.`);
    await refreshAllData();
    return { ok: true };
  };

  // Products: Update
  const handleUpdateProduct = async (productId, formData) => {
    const payload = {
      name: formData.name !== undefined ? formData.name.trim() : undefined,
      sku: formData.sku !== undefined ? formData.sku.trim().toUpperCase() : undefined,
      description: formData.description !== undefined ? formData.description : undefined,
      quantity_on_hand:
        formData.quantity_on_hand !== undefined
          ? parseInt(formData.quantity_on_hand, 10)
          : undefined,
      cost_price:
        formData.cost_price !== '' && formData.cost_price !== undefined
          ? parseFloat(formData.cost_price)
          : undefined,
      selling_price:
        formData.selling_price !== '' && formData.selling_price !== undefined
          ? parseFloat(formData.selling_price)
          : undefined,
      low_stock_threshold:
        formData.low_stock_threshold !== '' && formData.low_stock_threshold !== undefined
          ? parseInt(formData.low_stock_threshold, 10)
          : undefined
    };

    const res = await apiFetch(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return { ok: false, error: res.data?.detail || 'Failed to update product' };
    }

    showToast(`Updated "${res.data.name}".`);
    await refreshAllData();
    return { ok: true };
  };

  // Products: Delete
  const handleDeleteProduct = async (productId) => {
    const res = await apiFetch(`/products/${productId}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast(res.data?.detail || 'Delete failed', 'error');
      return { ok: false };
    }
    showToast('Product deleted.', 'info');
    await refreshAllData();
    return { ok: true };
  };

  // Settings: Update
  const handleUpdateSettings = async (newThreshold) => {
    const parsed = Math.max(0, parseInt(newThreshold, 10) || 0);
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify({ default_low_stock_threshold: parsed })
    });
    if (!res.ok) {
      showToast(res.data?.detail || 'Failed to update settings', 'error');
      return { ok: false };
    }
    showToast(`Default low stock threshold set to ≤ ${parsed}`);
    await refreshAllData();
    return { ok: true };
  };

  return (
    <div className="min-h-screen bg-[#FBF8F3] text-[#153E2E] flex flex-col justify-between selection:bg-[#E5F33C] selection:text-[#153E2E]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .font-editorial {
          font-family: 'Cormorant Garamond', Georgia, serif;
        }
        .font-sans-ui {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .font-mono-code {
          font-family: 'JetBrains Mono', monospace;
        }

        .ortiz-pill-btn {
          border-radius: 9999px;
          border: 1px solid #153E2E;
          background-color: transparent;
          color: #153E2E;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ortiz-pill-btn:hover {
          background-color: #153E2E;
          color: #FBF8F3;
          transform: translateY(-1px);
        }

        .ortiz-pill-solid {
          border-radius: 9999px;
          border: 1px solid #153E2E;
          background-color: #153E2E;
          color: #FBF8F3;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ortiz-pill-solid:hover {
          background-color: #1B4D38;
          box-shadow: 0 6px 20px -6px rgba(21, 62, 46, 0.45);
          transform: translateY(-1px);
        }
      `}</style>

      {/* HEADER NAVIGATION */}
      <header className="sticky top-0 z-30 bg-[#FBF8F3]/95 backdrop-blur-md border-b border-[#153E2E]">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-5 flex flex-wrap items-center justify-between gap-4 font-sans-ui">
          {/* Brand Identity */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => currentUser && setActiveScreen('dashboard')}
              className="text-left group focus:outline-none"
            >
              <div className="text-sm font-bold tracking-[0.2em] uppercase text-[#153E2E]">
                STOCKFLOW
              </div>
              <div className="text-[11px] text-[#153E2E]/70 font-mono-code flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
                {currentUser ? currentUser.organization.name : 'Store Inventory'}
              </div>
            </button>
          </div>

          {/* Navigation Links (Visible when logged in) */}
          {currentUser && (
            <nav className="flex items-center gap-6 sm:gap-8 text-xs font-semibold tracking-[0.14em] uppercase">
              {[
                { id: 'dashboard', label: '01 Overview' },
                { id: 'products', label: `02 Products (${products.length})` },
                { id: 'settings', label: '03 Settings' }
              ].map((item) => {
                const isActive = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveScreen(item.id);
                      refreshAllData();
                    }}
                    className={`relative py-1 transition ${
                      isActive ? 'text-[#153E2E] font-bold' : 'text-[#153E2E]/65 hover:text-[#153E2E]'
                    }`}
                  >
                    {item.label}
                    {isActive && (
                      <span className="absolute left-0 right-0 -bottom-1 h-[2px] bg-[#153E2E]" />
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <>
                <button
                  onClick={refreshAllData}
                  className="ortiz-pill-btn p-2 text-xs"
                  title="Refresh data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={() => {
                    setActiveScreen('products');
                    setTriggerCreateModal((c) => c + 1);
                  }}
                  className="ortiz-pill-solid px-5 py-2 text-[11px] font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Product
                </button>

                <button
                  onClick={handleLogout}
                  className="ortiz-pill-btn px-4 py-2 text-[11px] font-semibold text-[#D96B43] border-[#D96B43] hover:bg-[#D96B43] hover:text-[#FBF8F3]"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-5 sm:px-10 py-8 sm:py-12 font-sans-ui">
        {!currentUser ? (
          <div className="py-12 max-w-md mx-auto">
            <EditorialAuthCard
              authTab={authTab}
              setAuthTab={setAuthTab}
              onLogin={handleLogin}
              onSignup={handleSignup}
            />
          </div>
        ) : (
          <>
            {activeScreen === 'dashboard' && (
              <EditorialDashboardView
                currentUser={currentUser}
                summary={dashboardSummary}
                globalThreshold={orgSettings.default_low_stock_threshold}
                onNavigateProducts={() => setActiveScreen('products')}
                onNavigateSettings={() => setActiveScreen('settings')}
                onOpenNewProduct={() => {
                  setActiveScreen('products');
                  setTriggerCreateModal((c) => c + 1);
                }}
                onQuickAdjustStock={async (productId, delta) => {
                  const target = products.find((p) => p.id === productId);
                  if (!target) return;
                  const nextQty = Math.max(0, Number(target.quantity_on_hand) + delta);
                  await handleUpdateProduct(productId, {
                    ...target,
                    quantity_on_hand: nextQty
                  });
                }}
              />
            )}

            {activeScreen === 'products' && (
              <EditorialProductsView
                currentUser={currentUser}
                products={products}
                globalThreshold={orgSettings.default_low_stock_threshold}
                triggerCreateModal={triggerCreateModal}
                onCreateProduct={handleCreateProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onSearch={async (query) => {
                  const res = await apiFetch(
                    `/products${query ? `?search=${encodeURIComponent(query)}` : ''}`
                  );
                  if (res.ok && Array.isArray(res.data)) {
                    setProducts(
                      res.data.map((p) => ({
                        ...p,
                        id: p.product_id,
                        effective_threshold: p.low_stock_threshold
                      }))
                    );
                  }
                }}
              />
            )}

            {activeScreen === 'settings' && (
              <EditorialSettingsView
                currentUser={currentUser}
                orgSettings={orgSettings}
                onUpdateSettings={handleUpdateSettings}
                onLogout={handleLogout}
              />
            )}
          </>
        )}
      </main>

      {/* MINIMAL CLEAN FOOTER */}
      <footer className="border-t border-[#153E2E] py-6 text-xs text-[#153E2E]/70 font-sans-ui">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 flex flex-wrap items-center justify-between gap-4">
          <div className="font-semibold uppercase tracking-wider text-[11px] text-[#153E2E]">
            StockFlow Inventory System
          </div>
          <div className="font-mono-code text-[11px]">
            {currentUser ? `Store: ${currentUser.organization.name} (Org ID: ${currentUser.org_id})` : 'Multi-Tenant Isolated'}
          </div>
        </div>
      </footer>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-full bg-[#153E2E] text-[#FBF8F3] border border-[#E5F33C] shadow-2xl font-sans-ui text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E5F33C] shrink-0" />
          <span className="font-medium tracking-wide">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-[#FBF8F3]/70 hover:text-[#FBF8F3] ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VIEW 01: DASHBOARD (Overview Cards + Low Stock Table)
// ============================================================================
function EditorialDashboardView({
  currentUser,
  summary,
  globalThreshold,
  onNavigateProducts,
  onNavigateSettings,
  onOpenNewProduct,
  onQuickAdjustStock
}) {
  return (
    <div className="space-y-12">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#153E2E] pb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#153E2E]">
            01 / OVERVIEW
          </span>
          <h1 className="font-editorial text-5xl sm:text-6xl text-[#153E2E] mt-1">
            {currentUser.organization.name}
          </h1>
        </div>

        <button
          onClick={onOpenNewProduct}
          className="ortiz-pill-solid px-6 py-3 text-xs font-semibold flex items-center gap-2 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-[#F4EFE6] border border-[#153E2E] p-6 rounded-3xl">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#153E2E]/70">
            Total Products
          </span>
          <div className="font-editorial text-6xl font-semibold text-[#153E2E] mt-2">
            {summary.total_products}
          </div>
          <p className="text-xs text-[#153E2E]/70 mt-2">Registered catalog SKUs</p>
        </div>

        <div className="bg-[#F4EFE6] border border-[#153E2E] p-6 rounded-3xl">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#153E2E]/70">
            Total Quantity on Hand
          </span>
          <div className="font-editorial text-6xl font-semibold text-[#153E2E] mt-2">
            {summary.total_quantity_on_hand.toLocaleString()}
          </div>
          <p className="text-xs text-[#153E2E]/70 mt-2">Sum of all physical units</p>
        </div>

        <div
          className={`border border-[#153E2E] p-6 rounded-3xl ${
            summary.low_stock_items.length > 0 ? 'bg-[#FBECE6]' : 'bg-[#F4EFE6]'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D96B43]">
            Low Stock Alert
          </span>
          <div className="font-editorial text-6xl font-semibold text-[#D96B43] mt-2">
            {summary.low_stock_items.length}
          </div>
          <p className="text-xs text-[#153E2E]/80 mt-2">
            Products ≤ threshold ({globalThreshold})
          </p>
        </div>
      </div>

      {/* Low Stock Table */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-3xl font-semibold text-[#153E2E]">
              Low Stock Items
            </h2>
            <p className="text-xs text-[#153E2E]/70 mt-0.5">
              Items running low (Quantity on Hand ≤ Low Stock Threshold)
            </p>
          </div>
          <button
            onClick={onNavigateProducts}
            className="ortiz-pill-btn px-4 py-2 text-[11px] font-semibold inline-flex items-center gap-1.5"
          >
            <span>View All</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {summary.low_stock_items.length === 0 ? (
          <div className="py-12 px-6 bg-[#F4EFE6] border border-[#153E2E] rounded-2xl flex items-center justify-between">
            <div>
              <h3 className="font-editorial text-2xl text-[#153E2E]">
                All stock levels are healthy!
              </h3>
              <p className="text-xs text-[#153E2E]/70 mt-1">
                Zero products are currently below their low stock threshold.
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-[#153E2E]" />
          </div>
        ) : (
          <div className="border border-[#153E2E] rounded-2xl overflow-hidden bg-[#FBF8F3]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#153E2E] bg-[#F4EFE6] text-[10px] font-bold uppercase tracking-[0.15em] text-[#153E2E]">
                  <th className="py-3 px-5">Name</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Quantity on Hand</th>
                  <th className="py-3 px-4">Threshold</th>
                  <th className="py-3 px-5 text-right">Quick Restock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#153E2E]/30 text-sm">
                {summary.low_stock_items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F4EFE6]/60 transition">
                    <td className="py-4 px-5">
                      <div className="font-editorial text-xl font-semibold text-[#153E2E]">
                        {item.name}
                      </div>
                      <div className="text-xs text-[#153E2E]/65 truncate">
                        {item.description}
                      </div>
                    </td>

                    <td className="py-4 px-4 font-mono-code text-xs">
                      <span className="px-2.5 py-1 rounded-full bg-[#F4EFE6] border border-[#153E2E]/40">
                        {item.sku}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <span className="font-mono-code text-sm font-bold px-3 py-1 rounded-full border bg-[#FBECE6] text-[#D96B43] border-[#D96B43]">
                        {item.quantity_on_hand}
                      </span>
                    </td>

                    <td className="py-4 px-4 font-mono-code text-xs text-[#153E2E]">
                      ≤ {item.effective_threshold}
                    </td>

                    <td className="py-4 px-5 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => onQuickAdjustStock(item.id, 5)}
                          className="ortiz-pill-btn px-3 py-1 text-[11px] font-semibold"
                        >
                          +5
                        </button>
                        <button
                          onClick={() => onQuickAdjustStock(item.id, 10)}
                          className="ortiz-pill-solid px-3 py-1 text-[11px] font-semibold"
                        >
                          +10
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// VIEW 02: PRODUCTS CATALOG (List + Search + Actions)
// ============================================================================
function EditorialProductsView({
  currentUser,
  products,
  globalThreshold,
  triggerCreateModal,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onSearch
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [modalMode, setModalMode] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (triggerCreateModal > 0) {
      setSelectedProduct(null);
      setModalMode('create');
    }
  }, [triggerCreateModal]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (stockFilter === 'low') return p.is_low_stock;
      if (stockFilter === 'healthy') return !p.is_low_stock;
      return true;
    });
  }, [products, stockFilter]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#153E2E] pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#153E2E]">
            02 / PRODUCTS
          </span>
          <h1 className="font-editorial text-5xl text-[#153E2E] mt-1">Catalog</h1>
        </div>

        <button
          onClick={() => {
            setSelectedProduct(null);
            setModalMode('create');
          }}
          className="ortiz-pill-solid px-6 py-3 text-xs font-semibold flex items-center gap-2 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Search and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-[#F4EFE6] border border-[#153E2E] p-4 rounded-2xl">
        <form onSubmit={handleSearchSubmit} className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-[#153E2E]/60 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name or SKU (hit Enter)..."
            className="w-full bg-[#FBF8F3] border border-[#153E2E] rounded-full pl-10 pr-9 py-2.5 text-xs text-[#153E2E] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                onSearch('');
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#153E2E]/60"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        <div className="md:col-span-6 flex flex-wrap items-center md:justify-end gap-2">
          {[
            { id: 'all', label: `All (${products.length})` },
            { id: 'low', label: `Low Stock (${products.filter((p) => p.is_low_stock).length})` },
            { id: 'healthy', label: `In Stock (${products.filter((p) => !p.is_low_stock).length})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStockFilter(tab.id)}
              className={`px-4 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] border border-[#153E2E] transition ${
                stockFilter === tab.id
                  ? 'bg-[#153E2E] text-[#FBF8F3]'
                  : 'bg-[#FBF8F3] text-[#153E2E] hover:bg-[#DCD6F7]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border border-[#153E2E] rounded-2xl overflow-hidden bg-[#FBF8F3]">
        {filtered.length === 0 ? (
          <div className="p-14 text-center space-y-3">
            <h3 className="font-editorial text-3xl text-[#153E2E]">No products found.</h3>
            <p className="text-xs text-[#153E2E]/70">
              Try adjusting your search query or create a new product.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#153E2E] bg-[#F4EFE6] text-[10px] font-bold uppercase tracking-[0.16em] text-[#153E2E]">
                  <th className="py-4 px-5">Name</th>
                  <th className="py-4 px-4">SKU</th>
                  <th className="py-4 px-4">Quantity</th>
                  <th className="py-4 px-4">Low Stock Indicator</th>
                  <th className="py-4 px-4">Selling Price</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#153E2E]/30 text-sm">
                {filtered.map((product) => (
                  <tr key={product.id} className="hover:bg-[#F4EFE6]/80 transition">
                    <td className="py-4 px-5">
                      <div className="font-editorial text-2xl font-semibold text-[#153E2E] leading-tight">
                        {product.name}
                      </div>
                      <div className="text-xs text-[#153E2E]/70 mt-0.5 max-w-md truncate">
                        {product.description || 'No description'}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span className="font-mono-code text-xs px-3 py-1 rounded-full bg-[#F4EFE6] border border-[#153E2E]">
                        {product.sku}
                      </span>
                    </td>

                    {/* Quantity with Inline Stepper */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateProduct(product.id, {
                              ...product,
                              quantity_on_hand: Math.max(0, Number(product.quantity_on_hand) - 1)
                            })
                          }
                          className="w-6 h-6 rounded-full border border-[#153E2E] flex items-center justify-center hover:bg-[#153E2E] hover:text-[#FBF8F3] transition"
                          title="Decrement 1"
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <span className="font-mono-code font-bold text-base min-w-[2.2rem] text-center">
                          {product.quantity_on_hand}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            onUpdateProduct(product.id, {
                              ...product,
                              quantity_on_hand: Number(product.quantity_on_hand) + 1
                            })
                          }
                          className="w-6 h-6 rounded-full border border-[#153E2E] flex items-center justify-center hover:bg-[#153E2E] hover:text-[#FBF8F3] transition"
                          title="Increment 1"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-[10px] font-mono-code text-[#153E2E]/65 mt-1">
                        Threshold: ≤ {product.effective_threshold}
                      </div>
                    </td>

                    {/* Low Stock Indicator */}
                    <td className="py-4 px-4">
                      {product.is_low_stock ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#FBECE6] text-[#D96B43] border border-[#D96B43]">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-[#E5F33C] text-[#153E2E] border border-[#153E2E]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          In Stock
                        </span>
                      )}
                    </td>

                    {/* Selling Price */}
                    <td className="py-4 px-4 font-mono-code font-semibold text-sm">
                      ${Number(product.selling_price || 0).toFixed(2)}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setModalMode('edit');
                          }}
                          className="w-8 h-8 rounded-full border border-[#153E2E] flex items-center justify-center hover:bg-[#153E2E] hover:text-[#FBF8F3] transition"
                          title="Edit Product"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(product)}
                          className="w-8 h-8 rounded-full border border-[#D96B43] text-[#D96B43] flex items-center justify-center hover:bg-[#D96B43] hover:text-[#FBF8F3] transition"
                          title="Delete Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalMode && (
        <EditorialProductModal
          mode={modalMode}
          product={selectedProduct}
          globalThreshold={globalThreshold}
          onClose={() => setModalMode(null)}
          onSubmit={async (formData) => {
            if (modalMode === 'create') {
              return await onCreateProduct(formData);
            } else {
              return await onUpdateProduct(selectedProduct.id, formData);
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <EditorialDeleteModal
          product={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await onDeleteProduct(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// VIEW 03: SETTINGS (Global Low Stock Threshold)
// ============================================================================
function EditorialSettingsView({ currentUser, orgSettings, onUpdateSettings, onLogout }) {
  const [thresholdInput, setThresholdInput] = useState(orgSettings.default_low_stock_threshold);

  useEffect(() => {
    setThresholdInput(orgSettings.default_low_stock_threshold);
  }, [orgSettings.default_low_stock_threshold]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdateSettings(thresholdInput);
  };

  return (
    <div className="space-y-12">
      <div className="border-b border-[#153E2E] pb-8">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#153E2E]">
          03 / SETTINGS
        </span>
        <h1 className="font-editorial text-5xl sm:text-6xl text-[#153E2E] mt-1">
          Store Settings
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#153E2E]">
            DEFAULT LOW STOCK THRESHOLD
          </span>
          <p className="text-xs text-[#153E2E]/75 mt-2 leading-relaxed">
            This threshold applies whenever a product does not have its own threshold set.
          </p>
        </div>

        <div className="lg:col-span-8 bg-[#F4EFE6] border border-[#153E2E] rounded-3xl p-6 sm:p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-[0.14em] text-[#153E2E] mb-2">
                Global Default Low Stock Threshold (Units)
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <input
                  type="number"
                  min="0"
                  required
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-36 bg-[#FBF8F3] border border-[#153E2E] rounded-full px-5 py-3 font-mono-code text-xl font-bold text-[#153E2E] focus:outline-none"
                />
                <button type="submit" className="ortiz-pill-solid px-8 py-3.5 text-xs font-semibold">
                  Save Setting
                </button>
              </div>
            </div>
          </form>

          <div className="pt-6 border-t border-[#153E2E]/30 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">Active Account</div>
              <div className="text-xs font-mono-code text-[#153E2E]/80 mt-0.5">
                {currentUser.email} • Organization: {currentUser.organization.name}
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="px-5 py-2 rounded-full border border-[#D96B43] text-[#D96B43] hover:bg-[#D96B43] hover:text-[#FBF8F3] text-xs font-semibold uppercase tracking-wider transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AUTH CARD (Login & Signup)
// ============================================================================
function EditorialAuthCard({ authTab, setAuthTab, onLogin, onSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (authTab === 'login') {
        const res = await onLogin({ email, password });
        if (!res.ok) setError(res.error);
      } else {
        const res = await onSignup({ email, password, confirmPassword, organizationName });
        if (!res.ok) setError(res.error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#FBF8F3] border border-[#153E2E] rounded-3xl overflow-hidden shadow-2xl font-sans-ui">
      <div className="h-3 bg-[#E5F33C] border-b border-[#153E2E]" />
      <div className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="font-editorial text-4xl text-[#153E2E]">
            {authTab === 'login' ? 'Sign In to Store' : 'Create Organization'}
          </h2>
          <p className="text-xs text-[#153E2E]/70 mt-1">
            {authTab === 'login'
              ? 'Enter your credentials to access your inventory ledger.'
              : 'Sign up for a new account with your store organization.'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#F4EFE6] rounded-full border border-[#153E2E] mb-6">
          <button
            type="button"
            onClick={() => {
              setError('');
              setAuthTab('login');
            }}
            className={`py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition ${
              authTab === 'login' ? 'bg-[#153E2E] text-[#FBF8F3]' : 'text-[#153E2E]'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setAuthTab('signup');
            }}
            className={`py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition ${
              authTab === 'signup' ? 'bg-[#153E2E] text-[#FBF8F3]' : 'text-[#153E2E]'
            }`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-[#FBECE6] border border-[#D96B43] text-[#D96B43] text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {authTab === 'signup' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="e.g., My Test Store"
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2.5 text-sm focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@store.com"
              className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2.5 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
              Password *
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2.5 text-sm focus:outline-none"
            />
          </div>

          {authTab === 'signup' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Confirm Password *
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2.5 text-sm focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full ortiz-pill-solid py-3 text-xs font-semibold disabled:opacity-60"
          >
            {loading ? 'Please wait...' : authTab === 'login' ? 'Sign In' : 'Create Organization'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// PRODUCT MODAL (Create / Edit)
// ============================================================================
function EditorialProductModal({ mode, product, globalThreshold, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    description: product?.description || '',
    quantity_on_hand: product?.quantity_on_hand !== undefined ? product.quantity_on_hand : 0,
    cost_price: product?.cost_price !== null && product?.cost_price !== undefined ? product.cost_price : '',
    selling_price: product?.selling_price !== null && product?.selling_price !== undefined ? product.selling_price : '',
    low_stock_threshold: product?.low_stock_threshold !== null && product?.low_stock_threshold !== undefined ? product.low_stock_threshold : ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await onSubmit(formData);
      if (!res.ok) {
        setError(res.error);
      } else {
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#153E2E]/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans-ui">
      <div className="bg-[#FBF8F3] border border-[#153E2E] rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl">
        <div className="h-3 bg-[#E5F33C] border-b border-[#153E2E]" />
        <div className="px-6 py-4 border-b border-[#153E2E] flex items-center justify-between">
          <h3 className="font-editorial text-3xl text-[#153E2E]">
            {mode === 'create' ? 'Create Product' : 'Edit Product'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[#153E2E] flex items-center justify-center hover:bg-[#153E2E] hover:text-[#FBF8F3]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-[#FBECE6] border border-[#D96B43] text-[#D96B43] text-xs font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                SKU (Unique per Org) *
              </label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2 text-sm font-mono-code focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Quantity on Hand *
              </label>
              <input
                type="number"
                min="0"
                required
                value={formData.quantity_on_hand}
                onChange={(e) => setFormData({ ...formData, quantity_on_hand: e.target.value })}
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2 text-sm font-mono-code focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Cost Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                placeholder="0.00"
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2 text-sm font-mono-code focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Selling Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.selling_price}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                placeholder="0.00"
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2 text-sm font-mono-code focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Low Stock Threshold (Leave empty for default ≤{globalThreshold})
              </label>
              <input
                type="number"
                min="0"
                value={formData.low_stock_threshold}
                onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                placeholder={`Default is ${globalThreshold}`}
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-full px-4 py-2 text-sm font-mono-code focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-[#F4EFE6] border border-[#153E2E] rounded-2xl px-4 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#153E2E]/30 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="ortiz-pill-btn px-5 py-2 text-xs font-semibold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="ortiz-pill-solid px-6 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {loading ? 'Saving...' : mode === 'create' ? 'Create Product' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// DELETE CONFIRMATION MODAL
// ============================================================================
function EditorialDeleteModal({ product, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#153E2E]/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans-ui">
      <div className="bg-[#FBF8F3] border border-[#153E2E] rounded-3xl max-w-md w-full p-6 shadow-2xl">
        <h3 className="font-editorial text-3xl text-[#153E2E]">Delete Product?</h3>
        <p className="text-xs text-[#153E2E]/80 mt-2 leading-relaxed">
          Are you sure you want to delete <strong>{product.name}</strong> (SKU:{' '}
          <code className="font-mono-code">{product.sku}</code>)? This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={onCancel} className="ortiz-pill-btn px-5 py-2 text-xs font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-6 py-2 rounded-full bg-[#D96B43] text-[#FBF8F3] border border-[#153E2E] text-xs font-semibold uppercase tracking-wider"
          >
            Confirm Delete
          </button>
        </div>
      </div>
    </div>
  );
}
