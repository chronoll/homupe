
import { NextRequest, NextResponse } from 'next/server';
import { createCategory, getAllCategories, getCategory, updateCategory, deleteCategory } from '@/lib/repositories/categoryRepository';
import { validateCategory } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const category = await getCategory(id);
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
      return NextResponse.json(category);
    } else {
      const categories = await getAllCategories();
      return NextResponse.json(categories);
    }
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { isValid, errors } = validateCategory(body);

    if (!isValid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const newCategory = await createCategory(body);
    return NextResponse.json(newCategory, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { isValid, errors } = validateCategory(body);

    if (!isValid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const updatedCategory = await updateCategory(id, body);
    if (!updatedCategory) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    return NextResponse.json(updatedCategory);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    await deleteCategory(id);
    return new NextResponse(null, { status: 204 });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
