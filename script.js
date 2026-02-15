// Supabase Configuration
window.SUPABASE_CONFIG = {
  URL: 'https://yqilixfxaiuqqkzfrpgd.supabase.co',
  KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxaWxpeGZ4YWl1cXFremZycGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDQ3NjQsImV4cCI6MjA4NjcyMDc2NH0.mnkQCUFfY_mycgTQsSzvdtE17onHC6wdPwmsedMc_R4'
};

window.supabaseClient = null;
window.allComplaints = [];
window.selectedPhotoFile = null;
window.selectedPhotoURL = null;

// Pagination variables
window.currentPage = 1;
window.complaintsPerPage = 5;
window.filteredComplaints = [];

// Photo Upload Management
function togglePhotoOptions() {
  const options = document.getElementById('photoOptions');
  if (options) {
    options.classList.toggle('hidden');
  }
}

function removePhoto() {
  window.selectedPhotoFile = null;
  window.selectedPhotoURL = null;
  document.getElementById('previewImage').src = '';
  document.getElementById('photoPreview').classList.add('hidden');
  document.getElementById('cameraInput').value = '';
  document.getElementById('deviceInput').value = '';
}

// Setup photo file inputs
function setupPhotoInputs() {
  const cameraInput = document.getElementById('cameraInput');
  const deviceInput = document.getElementById('deviceInput');
  
  if (cameraInput) {
    cameraInput.addEventListener('change', (e) => handlePhotoSelect(e));
  }
  if (deviceInput) {
    deviceInput.addEventListener('change', (e) => handlePhotoSelect(e));
  }
}

function handlePhotoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('❌ File size must be less than 5MB');
    return;
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('❌ Please select an image file');
    return;
  }

  window.selectedPhotoFile = file;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = (event) => {
    window.selectedPhotoURL = event.target.result;
    document.getElementById('previewImage').src = window.selectedPhotoURL;
    document.getElementById('photoPreview').classList.remove('hidden');
    document.getElementById('photoOptions').classList.add('hidden');
    console.log('📸 Photo selected:', file.name);
  };
  reader.readAsDataURL(file);
}

// Upload photo to Supabase Storage
async function uploadPhotoToSupabase(complaintId) {
  if (!window.selectedPhotoFile || !window.supabaseClient) {
    return null;
  }

  try {
    const fileName = `complaints/${complaintId}/${Date.now()}-${window.selectedPhotoFile.name}`;
    
    const { data, error } = await window.supabaseClient
      .storage
      .from('complaint_photos')
      .upload(fileName, window.selectedPhotoFile);

    if (error) {
      console.error('❌ Photo upload error:', error);
      return null;
    }

    console.log('✅ Photo uploaded:', fileName);
    
    // Get public URL
    const { data: publicData } = window.supabaseClient
      .storage
      .from('complaint_photos')
      .getPublicUrl(fileName);

    return publicData.publicUrl;
  } catch (err) {
    console.error('❌ Photo upload exception:', err);
    return null;
  }
}

// Update complaint status
async function updateComplaintStatus(complaintId, newStatus) {
  if (!window.supabaseClient) {
    alert('❌ Database not connected');
    return;
  }

  try {
    const { error } = await window.supabaseClient
      .from('complaints')
      .update({ status: newStatus })
      .eq('id', complaintId);

    if (error) {
      console.error('❌ Error updating status:', error);
      alert('❌ Error: ' + error.message);
      return false;
    }

    console.log('✅ Status updated to:', newStatus);
    
    // Reload the dashboard
    loadAdminDashboard();
    return true;
  } catch (err) {
    console.error('❌ Exception updating status:', err);
    alert('❌ Error: ' + err.message);
    return false;
  }
}

// Initialize Supabase
function initializeSupabase() {
  if (window.supabaseClient) {
    console.log('✅ Supabase already initialized');
    return;
  }

  if (!window.supabase) {
    console.error('❌ Supabase library not loaded yet');
    setTimeout(initializeSupabase, 100);
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(
      window.SUPABASE_CONFIG.URL,
      window.SUPABASE_CONFIG.KEY
    );
    console.log('✅ Supabase initialized successfully!');
    setupEventListeners();
  } catch (err) {
    console.error('❌ Error initializing Supabase:', err);
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Setup photo inputs
  setupPhotoInputs();
  
  const form = document.getElementById('complaintForm');
  if (form) {
    console.log('✅ Form found! Setting up submit listener...');
    
    form.addEventListener('submit', async (e) => {
      console.log('🔄 FORM SUBMITTED!');
      e.preventDefault();

      if (!window.supabaseClient) {
        alert('❌ Database not connected yet. Please wait and try again.');
        return;
      }

      const msgElement = document.getElementById('msg');
      
      try {
        // Extract only text fields (exclude photo inputs)
        const complaint = {
          name: document.querySelector('input[name="name"]').value,
          email: document.querySelector('input[name="email"]').value,
          category: document.querySelector('input[name="category"]').value,
          title: document.querySelector('input[name="title"]').value,
          description: document.querySelector('textarea[name="description"]').value,
          status: 'Pending',
          photo_url: null
        };

        console.log('📝 Complaint data:', complaint);
        console.log('📤 Sending to Supabase...');

        // Insert complaint first
        let complaintId = null;
        let photoURL = null;
        
        // If we have a photo, we need to insert first to get an ID
        if (window.selectedPhotoFile) {
          console.log('📸 Uploading photo first...');
          
          // Insert without photo URL first
          const { data: tempComplaint, error: insertError } = await window.supabaseClient
            .from('complaints')
            .insert([complaint])
            .select();
          
          if (insertError) {
            throw insertError;
          }
          
          complaintId = tempComplaint[0].id;
          
          // Now upload the photo with the complaint ID
          photoURL = await uploadPhotoToSupabase(complaintId);
          
          // Update the complaint with photo URL
          if (photoURL) {
            const { error: updateError } = await window.supabaseClient
              .from('complaints')
              .update({ photo_url: photoURL })
              .eq('id', complaintId);
            
            if (updateError) {
              console.error('⚠️ Photo URL update error:', updateError);
            } else {
              console.log('✅ Photo URL saved to complaint');
            }
          }
        } else {
          // No photo, just insert normally
          const { data: savedComplaint, error: insertError } = await window.supabaseClient
            .from('complaints')
            .insert([complaint])
            .select();
          
          if (insertError) {
            throw insertError;
          }
          
          complaintId = savedComplaint[0].id;
        }

        console.log('✅ DATA SUCCESSFULLY STORED IN DATABASE!');
        console.log('Saved complaint ID:', complaintId);
        msgElement.innerText = 
          `✅ SUCCESS! Complaint submitted! Your ID: ${complaintId}`;
        msgElement.style.color = 'green';
        msgElement.style.fontSize = '16px';
        msgElement.style.padding = '15px';
        console.log('📊 Check your Supabase dashboard - data is there!');
        
        // Reset form and photo
        form.reset();
        removePhoto();
        
      } catch (err) {
        console.error('❌ EXCEPTION ERROR:', err);
        msgElement.innerText = `❌ Error: ${err.message}`;
        msgElement.style.color = 'red';
        console.log('Exception details:', err);
      }
    });
  } else {
    console.log('❌ Form NOT found!');
  }

  // Load admin dashboard on page load
  if (document.getElementById('adminList')) {
    loadAdminDashboard();
  }
}

// Track Complaint
async function trackComplaint() {
  const id = document.getElementById('trackId').value;
  console.log('🔍 Searching for complaint ID:', id);
  
  if (!id) {
    alert('Please enter a Complaint ID');
    return;
  }

  if (!window.supabaseClient) {
    alert('❌ Database not connected yet. Please wait and try again.');
    return;
  }

  try {
    const { data: complaints, error } = await window.supabaseClient
      .from('complaints')
      .select('*')
      .eq('id', parseInt(id));

    console.log('Track response:', { complaints, error });

    const box = document.getElementById('resultBox');
    
    if (error) {
      console.error('❌ Error tracking complaint:', error);
      box.innerHTML = `<p style="color: red;">❌ Error: ${error.message}</p>`;
    } else if (!complaints || complaints.length === 0) {
      console.log('⚠️ No complaint found');
      box.innerHTML = '<p>⚠️ No complaint found with that ID.</p>';
    } else {
      console.log('✅ Complaint found:', complaints[0]);
      const c = complaints[0];
      const photoHTML = c.photo_url 
        ? `<div style="margin: 15px 0;"><img src="${c.photo_url}" alt="Complaint photo" style="max-width: 100%; max-height: 400px; border-radius: 8px;"></div>`
        : '';
      box.innerHTML = `
        <h3>${c.title}</h3>
        <p><b>ID:</b> ${c.id}</p>
        <p><b>Name:</b> ${c.name}</p>
        <p><b>Email:</b> ${c.email}</p>
        <p><b>Category:</b> ${c.category}</p>
        <p><b>Status:</b> ${c.status}</p>
        <p><b>Description:</b> ${c.description}</p>
        ${photoHTML}
        <p><b>Submitted:</b> ${new Date(c.created_at).toLocaleString()}</p>
      `;
    }
    box.classList.remove('hidden');
  } catch (err) {
    console.error('❌ Track complaint exception:', err);
    document.getElementById('resultBox').innerHTML = 
      `<p style="color: red;">❌ Error: ${err.message}</p>`;
    document.getElementById('resultBox').classList.remove('hidden');
  }
}

// Load Admin Dashboard
async function loadAdminDashboard() {
  console.log('📊 Loading admin dashboard...');
  
  if (!window.supabaseClient) {
    console.error('❌ Supabase not initialized');
    const adminDiv = document.getElementById('adminList');
    if (adminDiv) {
      adminDiv.innerHTML = '<p style="color: red;">⏳ Initializing database...</p>';
    }
    return;
  }

  try {
    const { data: complaints, error } = await window.supabaseClient
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });

    console.log('Admin dashboard response:', { complaints, error });

    const adminDiv = document.getElementById('adminList');
    if (!adminDiv) return;
    
    if (error) {
      console.error('❌ Error loading complaints:', error);
      adminDiv.innerHTML = `<p style="color: red;">❌ Error loading complaints: ${error.message}</p>`;
      return;
    }

    window.allComplaints = complaints || [];
    console.log('✅ Loaded', window.allComplaints.length, 'complaints from database');
    
    // Update stats
    if (document.getElementById('totalCount')) {
      document.getElementById('totalCount').innerText = window.allComplaints.length;
      document.getElementById('pendingCount').innerText = 
        window.allComplaints.filter(c => c.status === 'Pending').length;
      document.getElementById('completedCount').innerText = 
        window.allComplaints.filter(c => c.status === 'Completed').length;
    }

    if (window.allComplaints.length === 0) {
      adminDiv.innerHTML = '<p>⚠️ No complaints yet.</p>';
      console.log('⚠️ No complaints in database');
      return;
    }

    // Reset to page 1 when loading
    window.currentPage = 1;
    filterAndPaginate();
    
  } catch (err) {
    console.error('❌ Admin dashboard exception:', err);
    const adminDiv = document.getElementById('adminList');
    if (adminDiv) {
      adminDiv.innerHTML = `<p style="color: red;">❌ Error: ${err.message}</p>`;
    }
  }
}

// Filter and Paginate Complaints
function filterAndPaginate() {
  const statusFilter = document.getElementById('statusFilter')?.value || '';

  // Apply filter
  if (statusFilter) {
    window.filteredComplaints = window.allComplaints.filter(c => c.status === statusFilter);
  } else {
    window.filteredComplaints = window.allComplaints;
  }

  // Calculate pagination
  const totalPages = Math.ceil(window.filteredComplaints.length / window.complaintsPerPage);
  
  // Ensure current page is valid
  if (window.currentPage > totalPages && totalPages > 0) {
    window.currentPage = totalPages;
  }

  // Get complaints for current page
  const startIndex = (window.currentPage - 1) * window.complaintsPerPage;
  const endIndex = startIndex + window.complaintsPerPage;
  const pageComplaints = window.filteredComplaints.slice(startIndex, endIndex);

  const adminDiv = document.getElementById('adminList');
  
  if (pageComplaints.length === 0) {
    adminDiv.innerHTML = '<p>No complaints match the filter.</p>';
  } else {
    adminDiv.innerHTML = pageComplaints.map(c => `
      <div class='card'>
        <h3>${c.title} <span style="color: #666; font-size: 0.9em;">(ID: ${c.id})</span></h3>
        <p><b>Name:</b> ${c.name}</p>
        <p><b>Email:</b> ${c.email}</p>
        <p><b>Category:</b> ${c.category}</p>
        <p><b>Status:</b> 
          <select class="status-dropdown" onchange="updateComplaintStatus(${c.id}, this.value)">
            <option value="Pending" ${c.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Completed" ${c.status === 'Completed' ? 'selected' : ''}>Completed</option>
          </select>
        </p>
        <p><b>Description:</b> ${c.description}</p>
        ${c.photo_url ? `
          <div style="margin: 15px 0;">
            <p><b>📸 Photo:</b></p>
            <img src="${c.photo_url}" alt="Complaint photo" 
              style="max-width: 100%; max-height: 400px; border-radius: 10px; border: 3px solid #667eea; box-shadow: 0 4px 15px rgba(102,126,234,0.3); cursor: pointer; transition: transform 0.3s ease;" 
              onclick="window.open('${c.photo_url}', '_blank')"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
            <p style="display:none; color: #e74c3c;">⚠️ Photo could not be loaded</p>
          </div>
        ` : '<p><b>📸 Photo:</b> No photo attached</p>'}
        <p><b>Submitted:</b> ${new Date(c.created_at).toLocaleString()}</p>
      </div>
    `).join('');
  }

  // Update pagination controls
  updatePaginationControls(totalPages);
}

// Update Pagination Controls
function updatePaginationControls(totalPages) {
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (pageInfo) {
    pageInfo.innerText = `Page ${window.currentPage} of ${totalPages}`;
  }

  if (prevBtn) {
    prevBtn.disabled = window.currentPage === 1;
    prevBtn.style.opacity = window.currentPage === 1 ? '0.5' : '1';
  }

  if (nextBtn) {
    nextBtn.disabled = window.currentPage >= totalPages;
    nextBtn.style.opacity = window.currentPage >= totalPages ? '0.5' : '1';
  }
}

// Pagination Functions
function nextPage() {
  const totalPages = Math.ceil(window.filteredComplaints.length / window.complaintsPerPage);
  if (window.currentPage < totalPages) {
    window.currentPage++;
    filterAndPaginate();
  }
}

function previousPage() {
  if (window.currentPage > 1) {
    window.currentPage--;
    filterAndPaginate();
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSupabase);
} else {
  initializeSupabase();
}