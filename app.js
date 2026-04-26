const DB_NAME = "romantic-gallery-db";
const STORE_NAME = "memories";
const DEFAULT_MEMORIES = [
  { id: "default-1", src: "imagem1.jpg", title: "Memoria 1", description: "", isDefault: true },
  { id: "default-2", src: "imagem2.jpg", title: "Memoria 2", description: "", isDefault: true }
];

const gallery = document.getElementById("gallery");
const gallerySection = document.getElementById("gallerySection");
const memoryInput = document.getElementById("memoryInput");
const template = document.getElementById("memoryCardTemplate");
const goToGalleryButton = document.getElementById("goToGalleryButton");
const memoryDialog = document.getElementById("memoryDialog");
const memoryDialogImage = document.getElementById("memoryDialogImage");
const memoryDescriptionInput = document.getElementById("memoryDescriptionInput");
const saveDescriptionButton = document.getElementById("saveDescriptionButton");

let activeMemoryId = null;
let activeMemoryIsDefault = false;

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredMemories() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function saveMemory(memory) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(memory);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteMemory(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function hideDefaultMemory(memory) {
  await saveMemory({
    ...memory,
    removed: true,
    isDefault: true
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function canLoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function renderMemories(memories) {
  gallery.innerHTML = "";

  memories.forEach((memory, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".memory-image");
    const deleteButton = node.querySelector(".delete-memory-button");
    const openButton = node.querySelector(".memory-open-button");
    const descriptionPreview = node.querySelector(".memory-description-preview");

    image.src = memory.src;
    image.alt = memory.title;
    descriptionPreview.textContent = memory.description || "Toque na foto para escrever uma descrição.";
    openButton.addEventListener("click", () => {
      openMemoryDialog(memory);
    });

    deleteButton.addEventListener("click", async () => {
      if (memory.isDefault) {
        await hideDefaultMemory(memory);
      } else {
        await deleteMemory(memory.id);
        await loadGallery();
      });
    }
    gallery.appendChild(node);
  });
}

async function getDefaultMemories() {
  const checks = await Promise.all(DEFAULT_MEMORIES.map((memory) => canLoadImage(memory.src)));
  const availableDefaults = DEFAULT_MEMORIES.filter((_, index) => checks[index]);
  const storedMemories = await getStoredMemories();
  const overrides = new Map(
    storedMemories
      .filter((memory) => memory.isDefault)
      .map((memory) => [memory.id, memory])
  );

  return availableDefaults
    .map((memory) => ({
      ...memory,
      ...(overrides.get(memory.id) || {})
    }))
    .filter((memory) => !memory.removed);

async function loadGallery() {
  const [defaultMemories, storedMemories] = await Promise.all([getDefaultMemories(), getStoredMemories()]);
  const customMemories = storedMemories.filter((memory) => !memory.isDefault);
  renderMemories([...defaultMemories, ...customMemories]);
}

function openMemoryDialog(memory) {
  activeMemoryId = memory.id;
  activeMemoryIsDefault = Boolean(memory.isDefault);
  memoryDialogImage.src = memory.src;
  memoryDialogImage.alt = memory.title || "Memoria";
  memoryDescriptionInput.value = memory.description || "";
  memoryDialog.showModal();
}

async function saveDescription() {
  if (!activeMemoryId) {
    return;
  }

  const allStoredMemories = await getStoredMemories();
  const existingMemory = allStoredMemories.find((memory) => memory.id === activeMemoryId);
  const defaultMemory = DEFAULT_MEMORIES.find((memory) => memory.id === activeMemoryId);
  const baseMemory = existingMemory || defaultMemory;

  if (!baseMemory) {
    return;
  }

  await saveMemory({
    ...baseMemory,
    description: memoryDescriptionInput.value.trim(),
    isDefault: activeMemoryIsDefault
  });

  await loadGallery();
  memoryDialog.close();
}

memoryInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  for (const file of files) {
    const src = await readFileAsDataUrl(file);
    await saveMemory({
      id: `memory-${Date.now()}-${crypto.randomUUID()}`,
      src,
      title: file.name.replace(/\.[^.]+$/, "") || "Nova memoria",
      description: "",
      isDefault: false,
      createdAt: new Date().toISOString()
    });
  }

  memoryInput.value = "";
  await loadGallery();
});

saveDescriptionButton.addEventListener("click", () => {
  saveDescription().catch(() => {
    // Ignore save failures to keep the interface responsive.
  });
});

goToGalleryButton.addEventListener("click", () => {
  gallerySection.classList.remove("gallery-section-hidden");
  gallerySection.scrollIntoView({ behavior: "smooth", block: "start" });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Ignore registration failures in unsupported environments.
    });
  });
}

loadGallery().catch(() => {
  gallery.innerHTML = "<p>Nao foi possivel carregar a galeria agora.</p>";
});
