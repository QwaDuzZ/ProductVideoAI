import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

interface Product {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  created_at: string;
}

interface ProductCatalogProps {
  onSelect?: (product: Product) => void;
  selectable?: boolean;
}

export function ProductCatalog({ onSelect, selectable = false }: ProductCatalogProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchProducts();
  }, [user]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    setProducts(data ?? []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;

    let imageUrl: string | null = null;
    if (newImage) {
      const path = `products/${user!.id}/${Date.now()}_${newImage.name}`;
      await supabase.storage.from("public").upload(path, newImage);
      const { data: urlData } = supabase.storage.from("public").getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }

    await supabase.from("products").insert({
      user_id: user!.id,
      name: newName,
      description: newDesc,
      image_url: imageUrl,
    });

    setNewName("");
    setNewDesc("");
    setNewImage(null);
    setShowAdd(false);
    fetchProducts();
  };

  if (loading) {
    return <div className="text-fog p-4">Загрузка...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-snow">Мои товары</h2>
        <button onClick={() => setShowAdd(true)} className="btn-secondary text-sm">
          + Добавить
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input w-full"
            placeholder="Название товара"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="input w-full h-20 resize-none"
            placeholder="Описание"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setNewImage(e.target.files?.[0] ?? null)}
            className="input w-full file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:bg-panel-2 file:text-snow"
          />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="btn-primary text-sm">
              Сохранить
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-ghost text-sm">
              Отмена
            </button>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-8 text-fog">
          Нет товаров. Добавьте первый товар.
        </div>
      ) : (
        <div className="grid gap-3">
          {products.map((product) => (
            <div
              key={product.id}
              className={`card flex items-center gap-4 ${
                selectable ? "cursor-pointer hover:border-magenta" : ""
              }`}
              onClick={() => selectable && onSelect?.(product)}
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-12 h-12 rounded-sm object-cover"
                />
              ) : (
                <div className="w-12 h-12 bg-panel-2 rounded-sm flex items-center justify-center text-xl">
                  📦
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-snow font-medium truncate">{product.name}</h3>
                <p className="text-fog text-sm truncate">{product.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
